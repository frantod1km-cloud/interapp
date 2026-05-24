"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { logAudit } from "@/lib/audit";
import { normalizeDni } from "@/lib/dni/parse";

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
  redirect(`/admin/empleados?error=${encodeURIComponent(msg)}`);
}

function normalizePlate(s: string): string {
  return s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function parseContract(formData: FormData): {
  contract_type: "permanent" | "temporary" | null;
  access_expires_at: string | null;
} {
  const ct = String(formData.get("contract_type") ?? "");
  const dateRaw = String(formData.get("access_expires_at") ?? "").trim();

  if (ct === "temporary") {
    if (!dateRaw) fail("Para contrato temporal hay que poner una fecha de vencimiento");
    const d = new Date(`${dateRaw}T23:59:59`);
    if (isNaN(d.getTime())) fail("Fecha de vencimiento inválida");
    return { contract_type: "temporary", access_expires_at: d.toISOString() };
  }
  return { contract_type: "permanent", access_expires_at: null };
}

// ---------------------------------------------------------------------------
// Alta de empleado del barrio (residents con kind='staff')
// ---------------------------------------------------------------------------
export async function addEmployeeAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();

  const dni = normalizeDni(String(formData.get("dni") ?? ""));
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const jobTitle = String(formData.get("job_title") ?? "").trim() || null;
  const employer = String(formData.get("employer") ?? "").trim() || null;

  if (!dni || dni.length < 7) fail("DNI inválido");
  if (!firstName || !lastName) fail("Faltan nombre o apellido");

  const { contract_type, access_expires_at } = parseContract(formData);

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("residents")
    .insert({
      organization_id: orgId,
      dni,
      first_name: firstName,
      last_name: lastName,
      phone,
      kind: "staff",
      job_title: jobTitle,
      employer,
      contract_type,
      access_expires_at,
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
    metadata: { kind: "staff", job_title: jobTitle, employer, contract_type },
  });

  revalidatePath("/admin/empleados");
  redirect("/admin/empleados?saved=1");
}

// ---------------------------------------------------------------------------
// Editar datos de un empleado
// ---------------------------------------------------------------------------
export async function updateEmployeeAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const employeeId = String(formData.get("employee_id") ?? "");
  if (!employeeId) return;

  const jobTitle = String(formData.get("job_title") ?? "").trim() || null;
  const employer = String(formData.get("employer") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const { contract_type, access_expires_at } = parseContract(formData);

  const admin = createAdminClient();
  await admin
    .from("residents")
    .update({ job_title: jobTitle, employer, phone, contract_type, access_expires_at })
    .eq("id", employeeId)
    .eq("organization_id", orgId)
    .eq("kind", "staff");

  revalidatePath("/admin/empleados");
  redirect("/admin/empleados?saved=1");
}

// ---------------------------------------------------------------------------
// Toggle activo
// ---------------------------------------------------------------------------
export async function toggleEmployeeActiveAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const employeeId = String(formData.get("employee_id") ?? "");
  const active = formData.get("active") === "true";
  if (!employeeId) return;

  const admin = createAdminClient();
  await admin
    .from("residents")
    .update({ active })
    .eq("id", employeeId)
    .eq("organization_id", orgId)
    .eq("kind", "staff");

  revalidatePath("/admin/empleados");
}

// ---------------------------------------------------------------------------
// Eliminar empleado
// ---------------------------------------------------------------------------
export async function removeEmployeeAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const employeeId = String(formData.get("employee_id") ?? "");
  if (!employeeId) return;

  const admin = createAdminClient();
  await admin
    .from("residents")
    .delete()
    .eq("id", employeeId)
    .eq("organization_id", orgId)
    .eq("kind", "staff");

  revalidatePath("/admin/empleados");
}

// ---------------------------------------------------------------------------
// Vehículos del empleado
// ---------------------------------------------------------------------------
export async function addEmployeeVehicleAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const employeeId = String(formData.get("employee_id") ?? "");
  const plate = normalizePlate(String(formData.get("plate") ?? ""));
  const make = String(formData.get("make") ?? "").trim() || null;
  const model = String(formData.get("model") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;

  if (!employeeId) return;
  if (!plate || plate.length < 4) fail("Patente inválida");

  const supabase = await createClient();
  // Chequear duplicado
  const { data: existing } = await supabase
    .from("vehicles")
    .select("id, resident_id, residents(first_name, last_name)")
    .eq("organization_id", orgId)
    .eq("plate", plate)
    .maybeSingle();
  if (existing) {
    if (existing.resident_id === employeeId) {
      fail(`La patente ${plate} ya está cargada para este empleado.`);
    }
    const owner = Array.isArray(existing.residents) ? existing.residents[0] : existing.residents;
    const ownerName = owner ? `${owner.first_name} ${owner.last_name}` : "otra persona";
    fail(`La patente ${plate} ya está registrada a nombre de ${ownerName}.`);
  }

  const { error } = await supabase.from("vehicles").insert({
    organization_id: orgId,
    resident_id: employeeId,
    plate,
    make,
    model,
    color,
  });
  if (error) fail(error.message);

  revalidatePath("/admin/empleados");
}

export async function removeEmployeeVehicleAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  if (!vehicleId) return;

  const supabase = await createClient();
  await supabase.from("vehicles").delete().eq("id", vehicleId).eq("organization_id", orgId);
  revalidatePath("/admin/empleados");
}
