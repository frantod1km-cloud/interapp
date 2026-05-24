"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";

const ALLOWED_KINDS = new Set(["lote", "casa", "depto", "local", "oficina", "otro"]);

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
  redirect(`/admin/unidades?error=${encodeURIComponent(msg)}`);
}

export async function addUnitAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const label = String(formData.get("label") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "lote");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!label) fail("La etiqueta es obligatoria");
  const kind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : "lote";

  const supabase = await createClient();
  const { error } = await supabase.from("units").insert({
    organization_id: orgId,
    label,
    kind,
    notes,
  });
  if (error) {
    if (error.code === "23505") fail(`Ya existe una unidad con la etiqueta "${label}".`);
    fail(error.message);
  }

  revalidatePath("/admin/unidades");
  redirect("/admin/unidades?saved=1");
}

export async function bulkCreateUnitsAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const prefix = String(formData.get("prefix") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "lote");
  const from = parseInt(String(formData.get("from") ?? "1"));
  const to = parseInt(String(formData.get("to") ?? "1"));

  if (!prefix) fail("Cargá un prefijo (ej: 'Lote')");
  if (isNaN(from) || isNaN(to) || from < 0 || to < from) fail("Rango inválido");
  if (to - from + 1 > 1000) fail("Máximo 1000 unidades por alta masiva");
  const kind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : "lote";

  // Armamos el array de rows
  const rows: { organization_id: string; label: string; kind: string }[] = [];
  for (let i = from; i <= to; i++) {
    rows.push({ organization_id: orgId, label: `${prefix} ${i}`, kind });
  }

  const supabase = await createClient();
  // Upsert con ignoreDuplicates: si ya existe esa etiqueta, no la duplica
  const { error } = await supabase
    .from("units")
    .upsert(rows, { onConflict: "organization_id,label", ignoreDuplicates: true });
  if (error) fail(error.message);

  revalidatePath("/admin/unidades");
  redirect("/admin/unidades?saved=1");
}

export async function updateUnitAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const unitId = String(formData.get("unit_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "lote");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!unitId || !label) return;
  const kind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : "lote";

  const admin = createAdminClient();
  await admin
    .from("units")
    .update({ label, kind, notes })
    .eq("id", unitId)
    .eq("organization_id", orgId);

  revalidatePath("/admin/unidades");
  redirect("/admin/unidades?saved=1");
}

export async function toggleUnitActiveAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const unitId = String(formData.get("unit_id") ?? "");
  const active = formData.get("active") === "true";
  if (!unitId) return;

  const admin = createAdminClient();
  await admin
    .from("units")
    .update({ active })
    .eq("id", unitId)
    .eq("organization_id", orgId);

  revalidatePath("/admin/unidades");
}

export async function removeUnitAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const unitId = String(formData.get("unit_id") ?? "");
  if (!unitId) return;

  const admin = createAdminClient();
  await admin.from("units").delete().eq("id", unitId).eq("organization_id", orgId);

  revalidatePath("/admin/unidades");
}
