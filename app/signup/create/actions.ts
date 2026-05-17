"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPreapproval } from "@/lib/mp";
import { PLANS, type PlanId } from "@/lib/plans";

const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "super", "auth", "login", "signup",
  "static", "assets", "help", "docs", "blog", "mail", "smtp",
]);

function fail(planId: string, msg: string): never {
  redirect(`/signup/create?plan=${planId}&error=${encodeURIComponent(msg)}`);
}

function baseDomain(host: string): { proto: string; root: string } {
  // En localhost devolvemos localhost:port. En prod, el dominio raíz.
  const hostname = host.split(":")[0];
  const port = host.includes(":") ? `:${host.split(":")[1]}` : "";
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { proto: "http", root: `localhost${port}` };
  }
  const parts = hostname.split(".");
  const root = parts.slice(-2).join(".");
  return { proto: "https", root };
}

export async function createOrgAction(formData: FormData) {
  const planId = String(formData.get("plan") ?? "trial") as PlanId;
  const plan = PLANS[planId];
  if (!plan || planId === "enterprise") fail(planId, "Plan inválido.");

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
  if (password.length < 8) fail(planId, "La contraseña tiene que tener al menos 8 caracteres.");

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

  // 6. Si es plan pago: crear preapproval en MP y redirigir
  if (plan.priceArs > 0) {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3000";
    const { proto, root } = baseDomain(host);
    const backUrl = `${proto}://${slug}.${root}/admin?welcome=1`;

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
      // No tiramos al usuario si MP falla — queda creado, banner avisa que falta pagar
      console.error("MP preapproval error:", e);
    }
  }

  // Plan trial o fallback: redirigir directo al panel del nuevo barrio
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const { proto, root } = baseDomain(host);
  redirect(`${proto}://${slug}.${root}/admin?welcome=1`);
}
