"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";

async function requireOrgAdmin(): Promise<string> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") throw new Error("Solo el admin del barrio");
  return org.id;
}

function fail(msg: string): never {
  redirect(`/admin/unidades/migrar?error=${encodeURIComponent(msg)}`);
}

// Asigna una hoja del árbol a todos los residentes que tenían un cierto
// texto legacy en `unit`. Reemplaza también el texto `unit` por el label
// de la hoja para que quede consistente.
export async function assignLegacyGroupAction(formData: FormData) {
  const orgId = await requireOrgAdmin();
  const unitText = String(formData.get("unit_text") ?? "");
  const leafId = String(formData.get("leaf_id") ?? "").trim();
  if (!unitText || !leafId) fail("Faltan datos");

  const admin = createAdminClient();
  const { data: leaf } = await admin
    .from("units")
    .select("id, label")
    .eq("id", leafId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!leaf) fail("Hoja no encontrada");

  await admin
    .from("residents")
    .update({ unit_id: leaf.id, unit: leaf.label })
    .eq("organization_id", orgId)
    .is("unit_id", null)
    .eq("unit", unitText);

  revalidatePath("/admin/unidades/migrar");
  revalidatePath("/admin/residents");
  redirect("/admin/unidades/migrar");
}

// Crea una hoja nueva en el árbol bajo un padre dado, y asigna a todos los
// residentes del grupo. Útil cuando un texto legacy no tiene un nodo
// equivalente todavía.
export async function createLeafAndAssignAction(formData: FormData) {
  const orgId = await requireOrgAdmin();
  const unitText = String(formData.get("unit_text") ?? "");
  const parentId = String(formData.get("parent_id") ?? "").trim() || null;
  const newLabel = String(formData.get("new_label") ?? "").trim();
  if (!unitText || !newLabel) fail("Faltan datos");

  const admin = createAdminClient();
  // Calcular nivel del nuevo nodo
  let level = 1;
  let kind: string | null = null;
  const { data: orgRow } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  const levels = ((orgRow?.settings as { unit_levels?: string[] } | null)?.unit_levels) ?? [];

  if (parentId) {
    const { data: parent } = await admin
      .from("units")
      .select("level")
      .eq("id", parentId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!parent) fail("Padre no encontrado");
    level = parent.level + 1;
  }
  if (level > levels.length) fail("Llegaste al nivel más profundo");
  kind = levels[level - 1];

  const { data: created, error } = await admin
    .from("units")
    .insert({
      organization_id: orgId,
      label: newLabel,
      kind,
      level,
      parent_id: parentId,
    })
    .select("id, label")
    .single();
  if (error) {
    if (error.code === "23505") fail(`Ya existe "${newLabel}" en este nivel del mismo padre.`);
    fail(error.message);
  }

  await admin
    .from("residents")
    .update({ unit_id: created.id, unit: created.label })
    .eq("organization_id", orgId)
    .is("unit_id", null)
    .eq("unit", unitText);

  revalidatePath("/admin/unidades/migrar");
  revalidatePath("/admin/residents");
  revalidatePath("/admin/unidades");
  redirect("/admin/unidades/migrar");
}

// Marca los residentes del grupo como "sin unidad" formalmente (limpia el
// texto legacy y deja unit_id en NULL). Útil para empleados/contratistas
// que no viven en una unidad fija.
export async function clearLegacyGroupAction(formData: FormData) {
  const orgId = await requireOrgAdmin();
  const unitText = String(formData.get("unit_text") ?? "");
  if (!unitText) fail("Falta el texto legacy");

  const admin = createAdminClient();
  await admin
    .from("residents")
    .update({ unit_id: null, unit: null })
    .eq("organization_id", orgId)
    .is("unit_id", null)
    .eq("unit", unitText);

  revalidatePath("/admin/unidades/migrar");
  revalidatePath("/admin/residents");
  redirect("/admin/unidades/migrar");
}
