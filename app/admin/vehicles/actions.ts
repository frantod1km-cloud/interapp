"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";

async function requireOrgAdmin(): Promise<{ orgId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") throw new Error("Solo el admin del barrio puede hacer esto");
  return { orgId: org.id };
}

function fail(msg: string): never {
  redirect(`/admin/vehicles?error=${encodeURIComponent(msg)}`);
}

function normalizePlate(s: string): string {
  return s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export async function addVehicleAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();

  const residentId = String(formData.get("resident_id") ?? "");
  const plate = normalizePlate(String(formData.get("plate") ?? ""));
  const make = String(formData.get("make") ?? "").trim() || null;
  const model = String(formData.get("model") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;

  if (!residentId) fail("Elegí un residente");
  if (!plate || plate.length < 4) fail("Patente inválida");

  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").insert({
    organization_id: orgId,
    resident_id: residentId,
    plate,
    make,
    model,
    color,
  });
  if (error) fail(error.message);

  revalidatePath("/admin/vehicles");
}

export async function removeVehicleAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  if (!vehicleId) return;

  const supabase = await createClient();
  await supabase
    .from("vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("organization_id", orgId);

  revalidatePath("/admin/vehicles");
}
