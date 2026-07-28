"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password";
import { PLANS, type PlanId } from "@/lib/plans";

// ---------------------------------------------------------------------------
// Guard: sólo super_admins acceden a estas actions
// ---------------------------------------------------------------------------
async function requireSuper(): Promise<{ userId: string; email: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isSuper = (user?.user_metadata as { is_super?: boolean } | null)?.is_super === true;
  if (!user || !isSuper) throw new Error("No autorizado");
  return { userId: user.id, email: user.email ?? null };
}

function failOrg(id: string, msg: string): never {
  redirect(`/super/orgs/${id}?error=${encodeURIComponent(msg)}`);
}
function failUsers(msg: string): never {
  redirect(`/super/users?error=${encodeURIComponent(msg)}`);
}
function failConfig(msg: string): never {
  redirect(`/super/config?error=${encodeURIComponent(msg)}`);
}

const ALLOWED_STATUS = new Set(["active", "past_due", "suspended", "archived"]);

// ---------------------------------------------------------------------------
// Cambiar estado de una organización (suspender / reactivar / archivar)
// ---------------------------------------------------------------------------
export async function setOrgStatusAction(formData: FormData) {
  const { userId } = await requireSuper();
  const orgId = String(formData.get("org_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!orgId || !ALLOWED_STATUS.has(status)) throw new Error("Datos inválidos");

  const admin = createAdminClient();
  await admin.from("organizations").update({ status }).eq("id", orgId);

  await logAudit({
    orgId,
    userId,
    action:
      status === "suspended"
        ? "org.suspend"
        : status === "archived"
          ? "org.archive"
          : "org.reactivate",
    entityType: "organization",
    entityId: orgId,
    metadata: { new_status: status, by: "super_admin" },
  });

  revalidatePath("/super");
  revalidatePath("/super/orgs");
  revalidatePath(`/super/orgs/${orgId}`);
}

// ---------------------------------------------------------------------------
// Editar datos básicos de una organización (nombre, plan, slug)
// ---------------------------------------------------------------------------
const SLUG_RE = /^[a-z0-9-]{3,40}$/;

export async function updateOrgAction(formData: FormData) {
  const { userId } = await requireSuper();
  const orgId = String(formData.get("org_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const plan = String(formData.get("plan") ?? "").trim();

  if (!orgId) throw new Error("Falta org_id");
  if (!name) failOrg(orgId, "El nombre no puede estar vacío");
  if (!SLUG_RE.test(slug)) failOrg(orgId, "Slug inválido (3-40 chars, letras/números/guion)");
  if (!(plan in PLANS)) failOrg(orgId, "Plan inválido");

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ name, slug, plan })
    .eq("id", orgId);
  if (error) {
    if (error.code === "23505") failOrg(orgId, `El slug "${slug}" ya está en uso por otro barrio`);
    failOrg(orgId, error.message);
  }

  await logAudit({
    orgId,
    userId,
    action: "org.update",
    entityType: "organization",
    entityId: orgId,
    metadata: { name, slug, plan },
  });

  revalidatePath(`/super/orgs/${orgId}`);
  revalidatePath("/super/orgs");
  redirect(`/super/orgs/${orgId}?saved=1`);
}

// ---------------------------------------------------------------------------
// Crear una organización manualmente (sin pagar por MP) + admin inicial
// ---------------------------------------------------------------------------
export async function createOrgManualAction(formData: FormData) {
  const { userId } = await requireSuper();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const plan = String(formData.get("plan") ?? "trial").trim();
  const adminEmail = String(formData.get("admin_email") ?? "").trim().toLowerCase();
  const adminPassword = String(formData.get("admin_password") ?? "");
  const adminName = String(formData.get("admin_name") ?? "").trim();

  if (!name || !slug) redirect("/super/orgs/new?error=Falta+nombre+o+slug");
  if (!SLUG_RE.test(slug)) redirect("/super/orgs/new?error=Slug+inválido");
  if (!(plan in PLANS)) redirect("/super/orgs/new?error=Plan+inválido");
  if (!adminEmail) redirect("/super/orgs/new?error=Falta+email+del+admin");
  const pwCheck = validatePassword(adminPassword);
  if (!pwCheck.ok) redirect(`/super/orgs/new?error=${encodeURIComponent(pwCheck.reason)}`);

  const admin = createAdminClient();

  // Crear organización
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name, slug, plan, status: "active" })
    .select("id")
    .single();
  if (orgErr || !org) {
    redirect(`/super/orgs/new?error=${encodeURIComponent(orgErr?.message ?? "No se pudo crear")}`);
  }

  // ¿Ya existe el user con ese email?
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existingUser = existing?.users.find((u) => u.email?.toLowerCase() === adminEmail);

  let uid: string;
  if (existingUser) {
    uid = existingUser.id;
  } else {
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName || null },
    });
    if (authErr || !created.user) {
      redirect(`/super/orgs/${org.id}?error=${encodeURIComponent(authErr?.message ?? "No se pudo crear el user")}`);
    }
    uid = created.user.id;
  }

  await admin
    .from("org_members")
    .insert({ organization_id: org.id, user_id: uid, role: "org_admin" });

  await logAudit({
    orgId: org.id,
    userId,
    action: "org.create",
    entityType: "organization",
    entityId: org.id,
    metadata: { name, slug, plan, admin_email: adminEmail, by: "super_admin" },
  });

  redirect(`/super/orgs/${org.id}?saved=1`);
}

// ---------------------------------------------------------------------------
// Impersonar: genera un magic link (short-lived) al admin de la org y lo
// devolvemos como URL. El super copia el link o clickea, se abre en otra
// pestaña, y ya queda logueado como ese admin. Cada uso queda en el audit.
// ---------------------------------------------------------------------------
export async function impersonateAdminAction(formData: FormData): Promise<void> {
  const { userId, email: superEmail } = await requireSuper();
  const orgId = String(formData.get("org_id") ?? "");
  if (!orgId) throw new Error("Falta org_id");

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, slug, name")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) failOrg(orgId, "Organización no encontrada");

  // Buscar al primer org_admin de la org
  const { data: membership } = await admin
    .from("org_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("role", "org_admin")
    .limit(1)
    .maybeSingle();
  if (!membership) failOrg(orgId, "Esta organización no tiene un org_admin cargado");

  const { data: targetUser } = await admin.auth.admin.getUserById(membership.user_id);
  if (!targetUser?.user?.email) failOrg(orgId, "El org_admin no tiene email registrado");

  // Generar magic link (login sin password)
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetUser.user.email,
    options: {
      redirectTo: `https://${org.slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "bzseguridad.online"}/admin`,
    },
  });
  if (error || !linkData.properties?.action_link) {
    failOrg(orgId, `No se pudo generar el link: ${error?.message ?? "unknown"}`);
  }

  await logAudit({
    orgId,
    userId,
    action: "org.impersonate",
    entityType: "organization",
    entityId: orgId,
    metadata: {
      by: superEmail,
      as_user: targetUser.user.email,
      generated_at: new Date().toISOString(),
    },
  });

  // Redirigimos al detalle con el link como query param, la UI lo muestra
  // en una alerta y con botón para copiar / abrir.
  const link = encodeURIComponent(linkData.properties.action_link);
  redirect(`/super/orgs/${orgId}?impersonate_link=${link}`);
}

// ---------------------------------------------------------------------------
// USERS (usuarios de la plataforma)
// ---------------------------------------------------------------------------
export async function toggleSuperAction(formData: FormData) {
  const { userId: myId, email: superEmail } = await requireSuper();
  const targetUserId = String(formData.get("user_id") ?? "");
  const makeSuper = formData.get("make_super") === "true";
  if (!targetUserId) failUsers("Falta user_id");
  if (targetUserId === myId && !makeSuper) failUsers("No podés quitarte los permisos a vos mismo");

  const admin = createAdminClient();
  const { data: target } = await admin.auth.admin.getUserById(targetUserId);
  if (!target?.user) failUsers("Usuario no encontrado");

  const meta = (target.user.user_metadata as Record<string, unknown> | null) ?? {};
  meta.is_super = makeSuper;
  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    user_metadata: meta,
  });
  if (error) failUsers(error.message);

  await logAudit({
    orgId: null,
    userId: myId,
    action: makeSuper ? "super.grant" : "super.revoke",
    entityType: "user",
    entityId: targetUserId,
    metadata: { by: superEmail, target_email: target.user.email },
  });

  revalidatePath("/super/users");
}

export async function resetUserPasswordAction(formData: FormData) {
  const { userId: myId, email: superEmail } = await requireSuper();
  const targetUserId = String(formData.get("user_id") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  if (!targetUserId) failUsers("Falta user_id");
  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.ok) failUsers(pwCheck.reason);

  const admin = createAdminClient();
  const { data: target } = await admin.auth.admin.getUserById(targetUserId);
  if (!target?.user) failUsers("Usuario no encontrado");

  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    password: newPassword,
  });
  if (error) failUsers(error.message);

  await logAudit({
    orgId: null,
    userId: myId,
    action: "user.password_reset",
    entityType: "user",
    entityId: targetUserId,
    metadata: { by: superEmail, target_email: target.user.email },
  });

  redirect("/super/users?saved=1");
}

// ---------------------------------------------------------------------------
// CONFIG global de la plataforma
// ---------------------------------------------------------------------------
// Se guarda en una única fila de la tabla "platform_config" (id="singleton").
// Si no existe, se crea. Usa jsonb para no requerir migraciones cada vez.
export async function saveGlobalConfigAction(formData: FormData) {
  const { userId } = await requireSuper();
  const announcement = String(formData.get("announcement") ?? "").trim() || null;
  const announcementLevel = String(formData.get("announcement_level") ?? "info");
  const signupOpen = formData.get("signup_open") === "on";
  const maintenance = formData.get("maintenance") === "on";

  const admin = createAdminClient();
  const { error } = await admin.from("platform_config").upsert(
    {
      id: "singleton",
      announcement,
      announcement_level: announcementLevel,
      signup_open: signupOpen,
      maintenance,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "id" },
  );
  if (error) failConfig(error.message);

  await logAudit({
    orgId: null,
    userId,
    action: "platform.config_update",
    entityType: "platform_config",
    metadata: { announcement, signup_open: signupOpen, maintenance },
  });

  revalidatePath("/super/config");
  redirect("/super/config?saved=1");
}

// Helper: cambiar plan de una org sin editar todo lo demás
export async function changeOrgPlanAction(formData: FormData) {
  const { userId } = await requireSuper();
  const orgId = String(formData.get("org_id") ?? "");
  const plan = String(formData.get("plan") ?? "").trim() as PlanId;
  if (!orgId || !(plan in PLANS)) throw new Error("Datos inválidos");

  const admin = createAdminClient();
  await admin.from("organizations").update({ plan }).eq("id", orgId);

  await logAudit({
    orgId,
    userId,
    action: "org.plan_change",
    entityType: "organization",
    entityId: orgId,
    metadata: { new_plan: plan },
  });

  revalidatePath(`/super/orgs/${orgId}`);
  revalidatePath("/super/orgs");
  redirect(`/super/orgs/${orgId}?saved=1`);
}
