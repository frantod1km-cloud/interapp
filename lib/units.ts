import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Modelo de la jerarquía de unidades.
//
// Cada org configura sus niveles de mayor a menor (ej. ["Sector","Etapa","Lote"]).
// Las unidades viven en un árbol con `parent_id` y `level` (1 = raíz).
// El residente vive en la **hoja** (lote/depto/galpón).
// ---------------------------------------------------------------------------

export type UnitLevels = string[];

export type TreeUnit = {
  id: string;
  label: string;
  kind: string | null;
  level: number;
  parent_id: string | null;
  active: boolean;
  children?: TreeUnit[];
  residentCount?: number;
};

export type LeafUnit = {
  id: string;
  label: string;
  kind: string | null;
  level: number;
  parent_id: string | null;
  breadcrumb: string; // "Etapa 2 · Sector Norte"
  full_path: string;  // "Sector Norte · Etapa 2 · Lote 42"
};

// Devuelve los niveles configurados por la org, o array vacío si no configuró.
// Si está vacío, el wizard /admin/setup/unidades es obligatorio antes de
// poder cargar unidades reales.
export async function getOrgUnitLevels(orgId: string): Promise<UnitLevels> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  const settings = (data?.settings ?? {}) as { unit_levels?: unknown };
  if (!Array.isArray(settings.unit_levels)) return [];
  return settings.unit_levels
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
}

export async function setOrgUnitLevels(orgId: string, levels: UnitLevels): Promise<void> {
  const admin = createAdminClient();
  const { data: cur } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  const settings = ((cur?.settings ?? {}) as Record<string, unknown>);
  settings.unit_levels = levels;
  await admin.from("organizations").update({ settings }).eq("id", orgId);
}

// Trae el árbol completo de unidades de una org. Inyecta el count de
// residentes activos en cada hoja para que el admin vea qué unidades están
// ocupadas. Para árboles grandes (>2000 unidades) deberíamos paginar; por
// ahora cargamos todo de una.
export async function getUnitTree(orgId: string): Promise<TreeUnit[]> {
  const admin = createAdminClient();
  const [{ data: units }, { data: residentCounts }] = await Promise.all([
    admin
      .from("units")
      .select("id, label, kind, level, parent_id, active, position")
      .eq("organization_id", orgId)
      .order("level")
      .order("position", { nullsFirst: false })
      .order("label"),
    admin
      .from("residents")
      .select("unit_id")
      .eq("organization_id", orgId)
      .eq("active", true)
      .not("unit_id", "is", null),
  ]);

  const counts = new Map<string, number>();
  for (const r of residentCounts ?? []) {
    if (!r.unit_id) continue;
    counts.set(r.unit_id, (counts.get(r.unit_id) ?? 0) + 1);
  }

  const nodes = new Map<string, TreeUnit>();
  const roots: TreeUnit[] = [];

  for (const u of units ?? []) {
    const node: TreeUnit = {
      id: u.id,
      label: u.label,
      kind: u.kind,
      level: u.level,
      parent_id: u.parent_id,
      active: u.active,
      children: [],
      residentCount: counts.get(u.id) ?? 0,
    };
    nodes.set(u.id, node);
  }

  for (const node of nodes.values()) {
    if (node.parent_id) {
      const parent = nodes.get(node.parent_id);
      if (parent) parent.children!.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// Trae solo las hojas (unidades sin hijos) con su breadcrumb pre-calculado.
// Usar para pickers que necesitan una lista plana ordenada por path.
export async function getUnitLeaves(orgId: string): Promise<LeafUnit[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("org_unit_leaves", { org_id: orgId });
  if (error || !data) return [];
  return data as LeafUnit[];
}

// Reconstruye el breadcrumb de una unidad concreta (server-side).
export async function getUnitBreadcrumb(unitId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("unit_breadcrumb", { unit_id: unitId });
  if (error || data == null) return null;
  return data as string;
}
