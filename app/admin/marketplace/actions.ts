"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";

async function requireAdmin(): Promise<{ orgId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") throw new Error("Solo admin");
  return { orgId: org.id };
}

const ALLOWED_KINDS = new Set(["space", "event", "membership"]);

function fail(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

function parseIntOr(name: FormDataEntryValue | null, fallback: number | null): number | null {
  if (name === null || name === "") return fallback;
  const n = parseInt(String(name));
  return isNaN(n) ? fallback : n;
}

function parseDateOr(name: FormDataEntryValue | null): string | null {
  if (!name) return null;
  const d = new Date(String(name));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function createListingAction(formData: FormData): Promise<void> {
  const { orgId } = await requireAdmin();

  const kind = String(formData.get("kind") ?? "");
  if (!ALLOWED_KINDS.has(kind)) fail("/admin/marketplace/new", "Tipo inválido");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const photoUrl = String(formData.get("photo_url") ?? "").trim() || null;
  const price = parseInt(String(formData.get("price_ars") ?? "0"));
  if (!name) fail("/admin/marketplace/new", "Falta el nombre");
  if (isNaN(price) || price < 0) fail("/admin/marketplace/new", "Precio inválido");

  const supabase = await createClient();
  const insertData: Record<string, unknown> = {
    organization_id: orgId,
    kind,
    name,
    description,
    photo_url: photoUrl,
    price_ars: price,
    active: true,
  };

  if (kind === "space") {
    insertData.slot_minutes = parseIntOr(formData.get("slot_minutes"), 60);
    insertData.max_concurrent = parseIntOr(formData.get("max_concurrent"), 1);
    insertData.advance_days = parseIntOr(formData.get("advance_days"), 30);
    insertData.open_hour = parseIntOr(formData.get("open_hour"), 8);
    insertData.close_hour = parseIntOr(formData.get("close_hour"), 22);
  } else if (kind === "event") {
    const startsAt = parseDateOr(formData.get("event_starts_at"));
    const endsAt = parseDateOr(formData.get("event_ends_at"));
    if (!startsAt) fail("/admin/marketplace/new", "Cargá la fecha del evento");
    insertData.event_starts_at = startsAt;
    insertData.event_ends_at = endsAt;
    insertData.event_capacity = parseIntOr(formData.get("event_capacity"), null);
  } else if (kind === "membership") {
    insertData.membership_months = parseIntOr(formData.get("membership_months"), 1);
  }

  const { data: created, error } = await supabase
    .from("listings")
    .insert(insertData)
    .select("id")
    .single();

  if (error || !created) fail("/admin/marketplace/new", error?.message ?? "Error al crear");

  revalidatePath("/admin/marketplace");
  redirect(`/admin/marketplace/${created.id}`);
}

export async function updateListingAction(formData: FormData): Promise<void> {
  const { orgId } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) fail("/admin/marketplace", "Falta id");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const photoUrl = String(formData.get("photo_url") ?? "").trim() || null;
  const price = parseInt(String(formData.get("price_ars") ?? "0"));
  const active = formData.get("active") === "on";

  if (!name) fail(`/admin/marketplace/${id}/edit`, "Falta el nombre");

  const updateData: Record<string, unknown> = {
    name,
    description,
    photo_url: photoUrl,
    price_ars: price,
    active,
    updated_at: new Date().toISOString(),
  };

  // Campos opcionales según kind
  if (formData.get("slot_minutes") !== null) {
    updateData.slot_minutes = parseIntOr(formData.get("slot_minutes"), 60);
    updateData.max_concurrent = parseIntOr(formData.get("max_concurrent"), 1);
    updateData.advance_days = parseIntOr(formData.get("advance_days"), 30);
    updateData.open_hour = parseIntOr(formData.get("open_hour"), 8);
    updateData.close_hour = parseIntOr(formData.get("close_hour"), 22);
  }
  if (formData.get("event_starts_at") !== null) {
    updateData.event_starts_at = parseDateOr(formData.get("event_starts_at"));
    updateData.event_ends_at = parseDateOr(formData.get("event_ends_at"));
    updateData.event_capacity = parseIntOr(formData.get("event_capacity"), null);
  }
  if (formData.get("membership_months") !== null) {
    updateData.membership_months = parseIntOr(formData.get("membership_months"), 1);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("listings")
    .update(updateData)
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) fail(`/admin/marketplace/${id}/edit`, error.message);

  revalidatePath("/admin/marketplace");
  revalidatePath(`/admin/marketplace/${id}`);
  redirect(`/admin/marketplace/${id}`);
}

export async function deleteListingAction(formData: FormData): Promise<void> {
  const { orgId } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("listings").delete().eq("id", id).eq("organization_id", orgId);

  revalidatePath("/admin/marketplace");
  redirect("/admin/marketplace");
}

export async function uploadListingPhotoAction(formData: FormData): Promise<{ url: string }> {
  const { orgId } = await requireAdmin();
  const file = formData.get("file") as File | null;
  if (!file || !file.size) throw new Error("Sin archivo");
  if (file.size > 5 * 1024 * 1024) throw new Error("Foto demasiado grande (máx. 5MB)");

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("listings")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("listings").getPublicUrl(path);
  return { url: data.publicUrl };
}
