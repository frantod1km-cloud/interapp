"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { logAudit } from "@/lib/audit";

async function requireOrgAdmin(): Promise<{ orgId: string; userId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") throw new Error("Solo el admin del barrio puede hacer esto");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { orgId: org.id, userId: user!.id };
}

function fail(msg: string): never {
  redirect(`/admin/guards?error=${encodeURIComponent(msg)}`);
}

export async function createGuardAction(formData: FormData) {
  const { orgId, userId: actorId } = await requireOrgAdmin();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !email) fail("Faltan nombre o email");
  if (password.length < 8) fail("La contraseña tiene que tener al menos 8 caracteres");

  const admin = createAdminClient();

  // ¿Ya existe un usuario con este email?
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existingUser = existing?.users.find((u) => u.email?.toLowerCase() === email);

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    // Si ya existe, verificamos que no sea miembro de la org en otro rol
    const { data: alreadyMember } = await admin
      .from("org_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (alreadyMember) fail(`Ese email ya es ${alreadyMember.role} en este barrio`);
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created.user) fail(createErr?.message ?? "No se pudo crear el usuario");
    userId = created.user.id;
  }

  const { error: memberErr } = await admin.from("org_members").insert({
    organization_id: orgId,
    user_id: userId,
    role: "guard",
  });
  if (memberErr) fail(memberErr.message);

  await logAudit({
    orgId,
    userId: actorId,
    action: "guard.create",
    entityType: "user",
    entityId: userId,
    metadata: { email, full_name: fullName },
  });

  revalidatePath("/admin/guards");
  redirect("/admin/guards?created=1");
}

export async function removeGuardAction(formData: FormData) {
  const { orgId, userId: actorId } = await requireOrgAdmin();
  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) return;

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("org_members")
    .select("user_id")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();

  await admin
    .from("org_members")
    .delete()
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .eq("role", "guard");

  if (member) {
    await logAudit({
      orgId,
      userId: actorId,
      action: "guard.remove",
      entityType: "user",
      entityId: member.user_id,
    });
  }

  revalidatePath("/admin/guards");
}
