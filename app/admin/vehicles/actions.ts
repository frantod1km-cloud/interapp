"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
  redirect(`/admin/vehicles?error=${encodeURIComponent(msg)}`);
}

function normalizePlate(s: string): string {
  return s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export async function addVehicleAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();

  const residentId = String(formData.get("resident_id") ?? "");
  const plate = normalizePlate(String(formData.get("plate") ?? ""));
  const make = String(formData.get("make") ?? "").trim() || null;
  const model = String(formData.get("model") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;

  if (!residentId) fail("Elegí un residente");
  if (!plate || plate.length < 4) fail("Patente inválida");

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("vehicles")
    .insert({ organization_id: orgId, resident_id: residentId, plate, make, model, color })
    .select("id")
    .single();
  if (error) fail(error.message);

  await logAudit({
    orgId,
    userId,
    action: "vehicle.create",
    entityType: "vehicle",
    entityId: created?.id,
    metadata: { plate, resident_id: residentId },
  });

  revalidatePath("/admin/vehicles");
}

export async function removeVehicleAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  if (!vehicleId) return;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("vehicles")
    .select("plate")
    .eq("id", vehicleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  await supabase
    .from("vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("organization_id", orgId);

  if (existing) {
    await logAudit({
      orgId,
      userId,
      action: "vehicle.remove",
      entityType: "vehicle",
      entityId: vehicleId,
      metadata: { plate: existing.plate },
    });
  }

  revalidatePath("/admin/vehicles");
}
