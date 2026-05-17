"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";

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
  redirect(`/resident/templates?error=${encodeURIComponent(msg)}`);
}

export async function createTemplateAction(formData: FormData) {
  const { orgId, residentId } = await currentResident();
  const label = String(formData.get("label") ?? "").trim();
  const dni = String(formData.get("dni") ?? "").replace(/\D/g, "");
  const visitorName = String(formData.get("visitor_name") ?? "").trim();
  const defaultUntilHour = parseInt(String(formData.get("default_until_hour") ?? "18"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!label) fail("Cargá una etiqueta");
  if (!dni || dni.length < 7) fail("DNI inválido");
  if (!visitorName) fail("Cargá el nombre");
  if (isNaN(defaultUntilHour) || defaultUntilHour < 0 || defaultUntilHour > 23) fail("Hora inválida");

  const supabase = await createClient();
  const { error } = await supabase.from("visit_templates").insert({
    organization_id: orgId,
    resident_id: residentId,
    label,
    dni,
    visitor_name: visitorName,
    default_until_hour: defaultUntilHour,
    notes,
  });
  if (error) fail(error.message);

  revalidatePath("/resident/templates");
  revalidatePath("/resident");
}

export async function deleteTemplateAction(formData: FormData) {
  const { residentId } = await currentResident();
  const id = String(formData.get("template_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("visit_templates").delete().eq("id", id).eq("resident_id", residentId);
  revalidatePath("/resident/templates");
  revalidatePath("/resident");
}

export async function applyTemplateAction(formData: FormData) {
  const { orgId, residentId } = await currentResident();
  const id = String(formData.get("template_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("visit_templates")
    .select("dni, visitor_name, default_until_hour, notes")
    .eq("id", id)
    .eq("resident_id", residentId)
    .maybeSingle();
  if (!t) return;

  const validUntil = new Date();
  validUntil.setHours(t.default_until_hour, 0, 0, 0);
  // Si ya pasó la hora hoy, validez hasta mañana a esa hora
  if (validUntil.getTime() < Date.now()) {
    validUntil.setDate(validUntil.getDate() + 1);
  }

  await supabase.from("authorizations").insert({
    organization_id: orgId,
    resident_id: residentId,
    dni: t.dni,
    visitor_name: t.visitor_name,
    valid_until: validUntil.toISOString(),
    notes: t.notes,
  });

  revalidatePath("/resident");
}
