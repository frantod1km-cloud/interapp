"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { logAudit } from "@/lib/audit";
import { normalizeDni } from "@/lib/dni/parse";
import { validatePassword } from "@/lib/password";

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

const ALLOWED_KINDS = new Set(["owner", "tenant", "family", "staff", "domestic", "contractor", "other"]);

export async function addResidentAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();

  const dni = normalizeDni(String(formData.get("dni") ?? ""));
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const unitId = String(formData.get("unit_id") ?? "").trim() || null;
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const kindRaw = String(formData.get("kind") ?? "owner");
  const kind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : "owner";

  if (!dni || !firstName || !lastName) fail("DNI, nombre y apellido son obligatorios.");

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("residents")
    .insert({
      organization_id: orgId,
      dni,
      first_name: firstName,
      last_name: lastName,
      unit_id: unitId,
      unit,
      phone,
      kind,
    })
    .select("id")
    .single();
  if (error) fail(error.message);

  await logAudit({
    orgId,
    userId,
    action: "resident.create",
    entityType: "resident",
    entityId: created?.id,
    metadata: { dni, name: `${firstName} ${lastName}`, unit, unit_id: unitId, kind },
  });

  revalidatePath("/admin/residents");
}

export async function updateResidentKindAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const residentId = String(formData.get("resident_id") ?? "");
  const kindRaw = String(formData.get("kind") ?? "");
  if (!residentId || !ALLOWED_KINDS.has(kindRaw)) return;

  const admin = createAdminClient();
  await admin
    .from("residents")
    .update({ kind: kindRaw })
    .eq("id", residentId)
    .eq("organization_id", orgId);

  revalidatePath("/admin/residents");
}

export async function inviteResidentAction(formData: FormData) {
  const { orgId, userId: actorId } = await requireOrgAdmin();
  const residentId = String(formData.get("resident_id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!residentId) fail("Residente no encontrado");
  if (!email) fail("Email obligatorio");
  const pwCheck = validatePassword(password);
  if (!pwCheck.ok) fail(pwCheck.reason);

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

// Edita campos básicos del residente. Re-normaliza el DNI por las dudas
// que el dato viejo tuviera basura (espacios, dots, etc.).
export async function editResidentAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const residentId = String(formData.get("resident_id") ?? "");
  if (!residentId) fail("Residente no encontrado");

  const dni = normalizeDni(String(formData.get("dni") ?? ""));
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const unitId = String(formData.get("unit_id") ?? "").trim() || null;
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const kindRaw = String(formData.get("kind") ?? "");
  const kind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : null;

  if (!dni || dni.length < 7) fail("DNI inválido");
  if (!firstName || !lastName) fail("Nombre y apellido son obligatorios");

  const admin = createAdminClient();
  const { error } = await admin
    .from("residents")
    .update({
      dni,
      first_name: firstName,
      last_name: lastName,
      unit_id: unitId,
      unit,
      phone,
      ...(kind ? { kind } : {}),
    })
    .eq("id", residentId)
    .eq("organization_id", orgId);
  if (error) fail(error.message);

  await logAudit({
    orgId,
    userId,
    action: "resident.update",
    entityType: "resident",
    entityId: residentId,
    metadata: { dni, name: `${firstName} ${lastName}`, unit, unit_id: unitId, kind },
  });

  revalidatePath("/admin/residents");
}

// Elimina definitivamente al residente. Solo permite el borrado si NO tiene
// vehículos / autorizaciones / eventos asociados; en caso contrario sugiere
// desactivar para no romper el historial.
export async function removeResidentAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const residentId = String(formData.get("resident_id") ?? "");
  if (!residentId) fail("Residente no encontrado");

  const admin = createAdminClient();

  // Chequeos previos: vehiculos y autorizaciones bloquean el borrado (FKs
  // con ON DELETE CASCADE harían daño silencioso). Pedimos al admin que
  // desactive en lugar de borrar si hay historial.
  const [{ count: vehicleCount }, { count: authCount }, { count: eventCount }] = await Promise.all([
    admin
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("resident_id", residentId),
    admin
      .from("authorizations")
      .select("id", { count: "exact", head: true })
      .eq("resident_id", residentId),
    admin
      .from("access_events")
      .select("id", { count: "exact", head: true })
      .eq("resident_id", residentId),
  ]);

  if ((vehicleCount ?? 0) + (authCount ?? 0) + (eventCount ?? 0) > 0) {
    fail(
      `No se puede eliminar: el residente tiene ${vehicleCount ?? 0} vehículo(s), ${authCount ?? 0} autorización(es) y ${eventCount ?? 0} evento(s). Desactivá en su lugar.`,
    );
  }

  const { data: r } = await admin
    .from("residents")
    .select("user_id, first_name, last_name, dni")
    .eq("id", residentId)
    .eq("organization_id", orgId)
    .maybeSingle();

  const { error } = await admin
    .from("residents")
    .delete()
    .eq("id", residentId)
    .eq("organization_id", orgId);
  if (error) fail(error.message);

  // Si tenía cuenta asociada solo a esta org, sacarle el membership.
  // (No borramos el auth.user porque podría ser miembro de otras orgs.)
  if (r?.user_id) {
    await admin
      .from("org_members")
      .delete()
      .eq("user_id", r.user_id)
      .eq("organization_id", orgId)
      .eq("role", "resident");
  }

  await logAudit({
    orgId,
    userId,
    action: "resident.delete",
    entityType: "resident",
    entityId: residentId,
    metadata: r
      ? { dni: r.dni, name: `${r.first_name} ${r.last_name}` }
      : { residentId },
  });

  revalidatePath("/admin/residents");
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
