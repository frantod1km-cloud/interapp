"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { validatePassword } from "@/lib/password";

async function currentResident(): Promise<{ orgId: string; residentId: string; userId: string }> {
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
  return { orgId: org.id, residentId: r.id, userId: user.id };
}

function fail(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

function normalizePlate(s: string): string {
  return s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

// ---------------------------------------------------------------------------
// Actualizar mi teléfono
// ---------------------------------------------------------------------------
export async function updateProfileAction(formData: FormData): Promise<void> {
  const { residentId } = await currentResident();
  const phone = String(formData.get("phone") ?? "").trim() || null;

  const supabase = await createClient();
  await supabase.from("residents").update({ phone }).eq("id", residentId);

  revalidatePath("/resident/profile");
  redirect("/resident/profile?saved=1");
}

// ---------------------------------------------------------------------------
// Cambiar mi contraseña
// ---------------------------------------------------------------------------
export async function changePasswordAction(formData: FormData): Promise<void> {
  await currentResident(); // valida sesión

  const newPassword = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.ok) fail("/resident/profile/password", pwCheck.reason);
  if (newPassword !== confirm) fail("/resident/profile/password", "Las contraseñas no coinciden");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) fail("/resident/profile/password", error.message);

  redirect("/resident/profile?saved=1");
}

// ---------------------------------------------------------------------------
// Mis vehículos
// ---------------------------------------------------------------------------
export async function addOwnVehicleAction(formData: FormData): Promise<void> {
  const { orgId, residentId } = await currentResident();
  const plate = normalizePlate(String(formData.get("plate") ?? ""));
  const make = String(formData.get("make") ?? "").trim() || null;
  const model = String(formData.get("model") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;

  if (!plate || plate.length < 4) fail("/resident/profile", "Patente inválida");

  // Chequear si la patente ya existe en la org (constraint unique
  // organization_id+plate). Damos un mensaje claro según el caso.
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("vehicles")
    .select("id, resident_id")
    .eq("organization_id", orgId)
    .eq("plate", plate)
    .maybeSingle();

  if (existing) {
    if (existing.resident_id === residentId) {
      fail("/resident/profile", `La patente ${plate} ya está cargada a tu nombre.`);
    }
    fail(
      "/resident/profile",
      `La patente ${plate} ya está registrada en este barrio por otro residente. Si es un error, pedile al admin que la transfiera.`,
    );
  }

  const { error } = await admin.from("vehicles").insert({
    organization_id: orgId,
    resident_id: residentId,
    plate,
    make,
    model,
    color,
  });
  if (error) fail("/resident/profile", error.message);

  revalidatePath("/resident/profile");
  redirect("/resident/profile?vehicle_added=1");
}

export async function removeOwnVehicleAction(formData: FormData): Promise<void> {
  const { residentId } = await currentResident();
  const id = String(formData.get("vehicle_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // RLS asegura que solo borrará si es de su resident_id
  await supabase.from("vehicles").delete().eq("id", id).eq("resident_id", residentId);

  revalidatePath("/resident/profile");
}
