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

function fail(msg: string, hash?: string): never {
  redirect(`/admin/residents?error=${encodeURIComponent(msg)}${hash ? `#${hash}` : ""}`);
}

export async function addResidentAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();

  const dni = String(formData.get("dni") ?? "").replace(/\D/g, "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;

  if (!dni || !firstName || !lastName) fail("DNI, nombre y apellido son obligatorios.");

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("residents")
    .insert({ organization_id: orgId, dni, first_name: firstName, last_name: lastName, unit, phone })
    .select("id")
    .single();
  if (error) fail(error.message);

  await logAudit({
    orgId,
    userId,
    action: "resident.create",
    entityType: "resident",
    entityId: created?.id,
    metadata: { dni, name: `${firstName} ${lastName}`, unit },
  });

  revalidatePath("/admin/residents");
}

export async function inviteResidentAction(formData: FormData) {
  const { orgId, userId: actorId } = await requireOrgAdmin();
  const residentId = String(formData.get("resident_id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!residentId) fail("Residente no encontrado");
  if (!email) fail("Email obligatorio");
  if (password.length < 8) fail("La contraseña tiene que tener al menos 8 caracteres");

  const admin = createAdminClient();

  // Verificar que el residente existe y pertenece a esta org
  const { data: resident } = await admin
    .from("residents")
    .select("id, user_id, first_name, last_name")
    .eq("id", residentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!resident) fail("Residente no encontrado en esta org");
  if (resident.user_id) fail("Este residente ya tiene cuenta asociada");

  // ¿Ya existe un usuario con ese email?
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existingUser = existing?.users.find((u) => u.email?.toLowerCase() === email);

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    // Verificar que no sea ya miembro de esta org en otro rol incompatible
    const { data: alreadyMember } = await admin
      .from("org_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (alreadyMember && alreadyMember.role !== "resident") {
      fail(`Ese email ya es ${alreadyMember.role} en este barrio`);
    }
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${resident.first_name} ${resident.last_name}` },
    });
    if (createErr || !created.user) fail(createErr?.message ?? "No se pudo crear el usuario");
    userId = created.user.id;
  }

  // Asociar user_id al residente
  await admin.from("residents").update({ user_id: userId }).eq("id", residentId);

  // Insertar membership (si no existe ya)
  await admin
    .from("org_members")
    .insert({ organization_id: orgId, user_id: userId, role: "resident" })
    .select()
    .maybeSingle()
    .then((res) => {
      // ignoramos error de unique constraint
      return res;
    });

  await logAudit({
    orgId,
    userId: actorId,
    action: "resident.invite",
    entityType: "resident",
    entityId: residentId,
    metadata: { email, resident_user_id: userId },
  });

  revalidatePath("/admin/residents");
  redirect("/admin/residents?invited=1");
}

export async function toggleResidentActiveAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const residentId = String(formData.get("resident_id") ?? "");
  const active = formData.get("active") === "true";
  if (!residentId) return;

  const admin = createAdminClient();
  await admin
    .from("residents")
    .update({ active })
    .eq("id", residentId)
    .eq("organization_id", orgId);

  await logAudit({
    orgId,
    userId,
    action: active ? "resident.reactivate" : "resident.deactivate",
    entityType: "resident",
    entityId: residentId,
  });

  revalidatePath("/admin/residents");
}
