"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";

const ALLOWED_KINDS = new Set(["domestic", "contractor"]);

async function currentResident(): Promise<{ orgId: string; residentId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: r } = await supabase
    .from("residents")
    .select("id")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!r) throw new Error("No estás asociado como residente");
  return { orgId: org.id, residentId: r.id };
}

function fail(msg: string): never {
  redirect(`/resident/people?error=${encodeURIComponent(msg)}`);
}

export async function addPersonAction(formData: FormData): Promise<void> {
  const { orgId, residentId } = await currentResident();

  const dni = String(formData.get("dni") ?? "").replace(/\D/g, "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "");
  const expiresAtRaw = String(formData.get("access_expires_at") ?? "").trim();

  if (!dni || dni.length < 7) fail("DNI inválido");
  if (!firstName || !lastName) fail("Faltan nombre o apellido");
  const kind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : "domestic";

  // Si vino una fecha (formato YYYY-MM-DD), la convertimos a fin del día local
  // para que la persona pueda entrar durante todo ese día.
  let expiresAt: string | null = null;
  if (expiresAtRaw) {
    const d = new Date(`${expiresAtRaw}T23:59:59`);
    if (isNaN(d.getTime())) fail("Fecha de vencimiento inválida");
    expiresAt = d.toISOString();
  }

  const supabase = await createClient();
  const { error } = await supabase.from("residents").insert({
    organization_id: orgId,
    authorized_by_resident_id: residentId,
    dni,
    first_name: firstName,
    last_name: lastName,
    kind,
    rule_enabled: false, // arranca sin restricción horaria
    access_expires_at: expiresAt,
  });

  if (error) fail(error.message);

  revalidatePath("/resident/people");
  redirect("/resident/people?added=1");
}

// Actualiza solo la fecha de expiración. Vacío = sin vencimiento (acceso permanente).
export async function updatePersonExpiryAction(formData: FormData): Promise<void> {
  const { residentId } = await currentResident();
  const id = String(formData.get("person_id") ?? "");
  const expiresAtRaw = String(formData.get("access_expires_at") ?? "").trim();
  if (!id) return;

  let expiresAt: string | null = null;
  if (expiresAtRaw) {
    const d = new Date(`${expiresAtRaw}T23:59:59`);
    if (isNaN(d.getTime())) fail("Fecha inválida");
    expiresAt = d.toISOString();
  }

  const supabase = await createClient();
  await supabase
    .from("residents")
    .update({ access_expires_at: expiresAt })
    .eq("id", id)
    .eq("authorized_by_resident_id", residentId);

  revalidatePath("/resident/people");
}

export async function removePersonAction(formData: FormData): Promise<void> {
  const { residentId } = await currentResident();
  const id = String(formData.get("person_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // RLS asegura que solo borrará si es autorizada por este residente
  await supabase
    .from("residents")
    .delete()
    .eq("id", id)
    .eq("authorized_by_resident_id", residentId);

  revalidatePath("/resident/people");
}

export async function togglePersonActiveAction(formData: FormData): Promise<void> {
  const { residentId } = await currentResident();
  const id = String(formData.get("person_id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("residents")
    .update({ active })
    .eq("id", id)
    .eq("authorized_by_resident_id", residentId);

  revalidatePath("/resident/people");
}

function normalizePlate(s: string): string {
  return s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

// Agregar vehículo a una persona autorizada por el residente actual.
// La RLS de la migration 0016 permite operar sobre personas que él autoriza.
export async function addPersonVehicleAction(formData: FormData): Promise<void> {
  const { orgId } = await currentResident();
  const personId = String(formData.get("person_id") ?? "");
  const plate = normalizePlate(String(formData.get("plate") ?? ""));
  const make = String(formData.get("make") ?? "").trim() || null;
  const model = String(formData.get("model") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;

  if (!personId) return;
  if (!plate || plate.length < 4) fail("Patente inválida");

  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").insert({
    organization_id: orgId,
    resident_id: personId,
    plate,
    make,
    model,
    color,
  });
  if (error) fail(error.message);

  revalidatePath("/resident/people");
}

export async function removePersonVehicleAction(formData: FormData): Promise<void> {
  await currentResident();
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  if (!vehicleId) return;

  const supabase = await createClient();
  // RLS asegura que solo borre vehículos de su gente (o suyos)
  await supabase.from("vehicles").delete().eq("id", vehicleId);

  revalidatePath("/resident/people");
}

export async function updatePersonRuleAction(formData: FormData): Promise<void> {
  const { residentId } = await currentResident();
  const id = String(formData.get("person_id") ?? "");
  const enabled = formData.get("rule_enabled") === "on";
  const weekdayMask = parseInt(String(formData.get("weekday_mask") ?? "127"));
  const startHour = parseInt(String(formData.get("start_hour") ?? "0"));
  const endHour = parseInt(String(formData.get("end_hour") ?? "23"));

  if (!id) return;
  if (isNaN(weekdayMask) || weekdayMask < 0 || weekdayMask > 127) fail("Días inválidos");
  if (isNaN(startHour) || startHour < 0 || startHour > 23) fail("Hora desde inválida");
  if (isNaN(endHour) || endHour < 0 || endHour > 23) fail("Hora hasta inválida");

  const supabase = await createClient();
  await supabase
    .from("residents")
    .update({
      rule_enabled: enabled,
      weekday_mask: weekdayMask,
      start_hour: startHour,
      end_hour: endHour,
    })
    .eq("id", id)
    .eq("authorized_by_resident_id", residentId);

  revalidatePath("/resident/people");
}
