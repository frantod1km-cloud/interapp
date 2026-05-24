"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { getOrgUnitLevels, setOrgUnitLevels } from "@/lib/units";

async function requireOrgAdmin(): Promise<{ orgId: string; userId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") throw new Error("Solo el admin del barrio puede hacer esto");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { orgId: org.id, userId: user!.id };
}

function fail(msg: string, path = "/admin/unidades"): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

// ---------------------------------------------------------------------------
// SETUP de niveles del barrio (wizard)
// ---------------------------------------------------------------------------
// Recibe un array de strings (los nombres de los niveles, de mayor a menor).
// Ej: ["Sector", "Etapa", "Lote"]
// Una vez configurado, el admin puede empezar a cargar el árbol.
// Cambiar los niveles después es desaconsejado pero permitido si no hay
// unidades cargadas aún.
export async function saveUnitLevelsAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const raw = formData.getAll("levels").map((v) => String(v).trim()).filter(Boolean);
  if (raw.length === 0) fail("Definí al menos un nivel", "/admin/setup/unidades");
  if (raw.length > 5) fail("Máximo 5 niveles", "/admin/setup/unidades");

  // Si ya hay unidades cargadas y cambian la cantidad de niveles, bloqueamos.
  const admin = createAdminClient();
  const { count: existing } = await admin
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  const currentLevels = await getOrgUnitLevels(orgId);
  if ((existing ?? 0) > 0 && currentLevels.length > 0 && currentLevels.length !== raw.length) {
    fail(
      "No se puede cambiar la cantidad de niveles cuando ya hay unidades cargadas. Eliminá todas las unidades primero.",
      "/admin/setup/unidades",
    );
  }

  await setOrgUnitLevels(orgId, raw);
  revalidatePath("/admin/unidades");
  revalidatePath("/admin/setup/unidades");
  redirect("/admin/unidades?level_saved=1");
}

// ---------------------------------------------------------------------------
// Alta de UN nodo (en cualquier nivel)
// ---------------------------------------------------------------------------
// label = identificador corto dentro de su padre (ej. "42", "Norte", "A")
// parent_id = nulo si es nodo raíz, sino el id del padre
// El nivel se calcula automáticamente desde el padre.
export async function addUnitAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const label = String(formData.get("label") ?? "").trim();
  const parentId = String(formData.get("parent_id") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!label) fail("La etiqueta es obligatoria");

  const levels = await getOrgUnitLevels(orgId);
  if (levels.length === 0) fail("Primero configurá los niveles del barrio", "/admin/setup/unidades");

  const admin = createAdminClient();
  let level = 1;
  if (parentId) {
    const { data: parent } = await admin
      .from("units")
      .select("level")
      .eq("id", parentId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!parent) fail("Unidad padre no encontrada");
    level = parent.level + 1;
  }
  if (level > levels.length) fail(`Llegaste al nivel más profundo (${levels[levels.length - 1]})`);

  const kind = levels[level - 1];

  const { error } = await admin.from("units").insert({
    organization_id: orgId,
    label,
    kind,
    level,
    parent_id: parentId,
    notes,
  });
  if (error) {
    if (error.code === "23505") fail(`Ya existe "${label}" en este nivel del mismo padre.`);
    fail(error.message);
  }

  revalidatePath("/admin/unidades");
  redirect("/admin/unidades?saved=1");
}

// ---------------------------------------------------------------------------
// Alta MASIVA dentro de un padre (ej. "creá los Lote 1 a 30 dentro de
// Etapa 2 / Sector Norte")
// ---------------------------------------------------------------------------
export async function bulkCreateUnitsAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const parentId = String(formData.get("parent_id") ?? "").trim() || null;
  const prefix = String(formData.get("prefix") ?? "").trim();
  const from = parseInt(String(formData.get("from") ?? "1"));
  const to = parseInt(String(formData.get("to") ?? "1"));

  if (isNaN(from) || isNaN(to) || from < 0 || to < from) fail("Rango inválido");
  if (to - from + 1 > 1000) fail("Máximo 1000 unidades por alta masiva");

  const levels = await getOrgUnitLevels(orgId);
  if (levels.length === 0) fail("Primero configurá los niveles", "/admin/setup/unidades");

  const admin = createAdminClient();
  let level = 1;
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
  if (level > levels.length) fail(`Llegaste al nivel más profundo (${levels[levels.length - 1]})`);

  const kind = levels[level - 1];
  // Si no pasaron prefijo, usamos solo el número como label (ej "1", "2"...)
  // Si pasaron prefijo, lo concatenamos: "Lote 1", "Lote 2"...
  const rows: Array<{
    organization_id: string;
    label: string;
    kind: string;
    level: number;
    parent_id: string | null;
  }> = [];
  for (let i = from; i <= to; i++) {
    const label = prefix ? `${prefix} ${i}` : String(i);
    rows.push({ organization_id: orgId, label, kind, level, parent_id: parentId });
  }

  // Usamos insert + onConflict do nothing manual via try/catch por fila
  // sería caro. Mejor: insert con ignoreDuplicates en el unique index nuevo.
  // El unique index es (organization_id, coalesce(parent_id, '_root_'), label).
  // Supabase no tiene onConflict para expression indexes, así que tenemos
  // que filtrar duplicados antes.
  const { data: existing } = await admin
    .from("units")
    .select("label")
    .eq("organization_id", orgId)
    .eq("level", level)
    .or(parentId ? `parent_id.eq.${parentId}` : "parent_id.is.null");
  const taken = new Set((existing ?? []).map((u) => u.label));
  const toInsert = rows.filter((r) => !taken.has(r.label));

  if (toInsert.length === 0) {
    redirect("/admin/unidades?saved=1&skipped=all");
  }

  const { error } = await admin.from("units").insert(toInsert);
  if (error) fail(error.message);

  revalidatePath("/admin/unidades");
  redirect(`/admin/unidades?saved=1&created=${toInsert.length}`);
}

// ---------------------------------------------------------------------------
// Edición / borrado / toggle activo de UN nodo
// ---------------------------------------------------------------------------
export async function updateUnitAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const unitId = String(formData.get("unit_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!unitId || !label) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("units")
    .update({ label, notes })
    .eq("id", unitId)
    .eq("organization_id", orgId);
  if (error) {
    if (error.code === "23505") fail(`Ya existe "${label}" en este nivel.`);
    fail(error.message);
  }

  revalidatePath("/admin/unidades");
  redirect("/admin/unidades?saved=1");
}

export async function toggleUnitActiveAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const unitId = String(formData.get("unit_id") ?? "");
  const active = formData.get("active") === "true";
  if (!unitId) return;

  const admin = createAdminClient();
  // Si desactivamos un nodo padre, desactivamos toda la rama recursivamente.
  // Recursive update no es nativo en Supabase, así que lo hacemos en JS
  // (los árboles son chicos).
  const allDescendants = active ? [unitId] : await collectDescendants(orgId, unitId);
  await admin
    .from("units")
    .update({ active })
    .in("id", allDescendants)
    .eq("organization_id", orgId);

  revalidatePath("/admin/unidades");
}

async function collectDescendants(orgId: string, rootId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: all } = await admin
    .from("units")
    .select("id, parent_id")
    .eq("organization_id", orgId);
  const ids = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const u of all ?? []) {
      if (u.parent_id && ids.has(u.parent_id) && !ids.has(u.id)) {
        ids.add(u.id);
        added = true;
      }
    }
  }
  return Array.from(ids);
}

export async function removeUnitAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const unitId = String(formData.get("unit_id") ?? "");
  if (!unitId) return;

  const admin = createAdminClient();

  // Bloquear si hay residentes activos apuntando a esta unidad (o cualquier
  // descendiente).
  const allIds = await collectDescendants(orgId, unitId);
  const { count: residentCount } = await admin
    .from("residents")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("unit_id", allIds);
  if ((residentCount ?? 0) > 0) {
    fail(
      `No se puede eliminar: hay ${residentCount} residente(s) asignado(s) a esta unidad o sus descendientes. Reasignalos primero.`,
    );
  }

  // CASCADE en la FK borra los hijos automáticamente.
  await admin.from("units").delete().eq("id", unitId).eq("organization_id", orgId);
  revalidatePath("/admin/unidades");
}
