"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPreapproval } from "@/lib/mp";
import { PLANS, type PlanId } from "@/lib/plans";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { validatePassword } from "@/lib/password";

const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "super", "auth", "login", "signup",
  "static", "assets", "help", "docs", "blog", "mail", "smtp",
]);

function fail(planId: string, msg: string): never {
  redirect(`/signup/create?plan=${planId}&error=${encodeURIComponent(msg)}`);
}

function baseDomain(host: string): { proto: string; root: string } {
  // En localhost devolvemos localhost:port. En prod, el dominio raíz
  // configurado en NEXT_PUBLIC_ROOT_DOMAIN o, si no está, intentamos
  // inferirlo heurísticamente del host.
  const hostname = host.split(":")[0];
  const port = host.includes(":") ? `:${host.split(":")[1]}` : "";
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { proto: "http", root: `localhost${port}` };
  }
  const envRoot = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").trim().toLowerCase();
  if (envRoot) {
    return { proto: "https", root: envRoot };
  }
  // Fallback: últimos 2 segmentos del host
  const parts = hostname.split(".");
  const root = parts.slice(-2).join(".");
  return { proto: "https", root };
}

export async function createOrgAction(formData: FormData) {
  const planId = String(formData.get("plan") ?? "trial") as PlanId;
  const plan = PLANS[planId];
  if (!plan || planId === "enterprise") fail(planId, "Plan inválido.");

  // Rate limit: máximo 3 signups por IP por hora
  const ip = await clientIp();
  const rl = await rateLimit({
    identifier: `ip:${ip}`,
    action: "signup",
    max: 3,
    windowSeconds: 3600,
  });
  if (!rl.allowed) fail(planId, "Demasiados intentos de creación de barrio desde tu IP. Probá de nuevo más tarde.");

  const orgName = String(formData.get("org_name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!orgName || !slug || !email || !password || !fullName) {
    fail(planId, "Faltan datos obligatorios.");
  }
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) {
    fail(planId, "Subdominio inválido (3-40 caracteres, solo letras, números y guion; algunos están reservados).");
  }
  const pwCheck = validatePassword(password);
  if (!pwCheck.ok) fail(planId, pwCheck.reason);

  const admin = createAdminClient();

  // 1. ¿Slug libre?
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) fail(planId, "Ese subdominio ya está en uso.");

  // 2. Crear usuario (auto-confirmado, el guardia/admin necesita entrar ya)
  const { data: userResp, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (userErr || !userResp.user) fail(planId, userErr?.message ?? "No se pudo crear el usuario.");

  // 3. Crear organización
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      slug,
      name: orgName,
      plan: planId,
      status: planId === "trial" ? "active" : "past_due", // past_due hasta confirmar MP
    })
    .select("id")
    .single();
  if (orgErr || !org) {
    // best-effort cleanup
    await admin.auth.admin.deleteUser(userResp.user.id);
    fail(planId, orgErr?.message ?? "No se pudo crear el barrio.");
  }

  // 4. Asignar al usuario como org_admin
  const { error: memberErr } = await admin.from("org_members").insert({
    organization_id: org.id,
    user_id: userResp.user.id,
    role: "org_admin",
  });
  if (memberErr) fail(planId, memberErr.message);

  // 5. Crear registro de suscripción
  await admin.from("subscriptions").insert({
    organization_id: org.id,
    plan: planId,
    status: planId === "trial" ? "trial" : "pending",
  });

  // Si es plan pago: crear preapproval en MP y redirigir
  if (plan.priceArs > 0) {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3000";
    const { proto, root } = baseDomain(host);
    // Vuelta de MP → /login con bandera de bienvenida en el subdominio del barrio
    const backUrl = `${proto}://${slug}.${root}/login?welcome=1`;

    try {
      const pre = await createPreapproval({
        payerEmail: email,
        amountArs: plan.priceArs,
        reason: `interapp — Plan ${plan.name} (${orgName})`,
        externalReference: org.id,
        backUrl,
      });
      await admin
        .from("subscriptions")
        .update({ mp_preapproval_id: pre.id, updated_at: new Date().toISOString() })
        .eq("organization_id", org.id);

      redirect(pre.init_point);
    } catch (e) {
      console.error("MP preapproval error:", e);
    }
  }

  // Plan trial o fallback: redirigir al login del subdominio.
  // No podemos auto-loguear porque la sesión que se cree acá quedaría en
  // el dominio raíz y no se compartiría con el subdominio.
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const { proto, root } = baseDomain(host);
  redirect(`${proto}://${slug}.${root}/login?welcome=1`);
}
