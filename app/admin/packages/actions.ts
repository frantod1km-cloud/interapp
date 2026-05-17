"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { logAudit } from "@/lib/audit";
import { pushToUser } from "@/lib/push";

// Permisos:
//   guard / guard_lead / org_admin → pueden recibir, entregar y devolver paquetes
//   resident → solo puede marcar como entregados los suyos
async function requireOperator(): Promise<{ orgId: string; orgName: string; userId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const role = await getCurrentMemberRole(org.id);
  if (role !== "guard" && role !== "guard_lead" && role !== "org_admin") {
    throw new Error("No tenés permiso para gestionar paquetes");
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { orgId: org.id, orgName: org.name, userId: user!.id };
}

function fail(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

// ---------------------------------------------------------------------------
// Recibir un paquete (guardia / admin)
// ---------------------------------------------------------------------------
export async function createPackageAction(formData: FormData): Promise<void> {
  const { orgId, orgName, userId } = await requireOperator();

  const residentId = String(formData.get("resident_id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const courier = String(formData.get("courier") ?? "").trim() || null;
  const photoUrl = String(formData.get("photo_url") ?? "").trim() || null;
  const gateId = String(formData.get("gate_id") ?? "").trim() || null;
  const gateLabel = String(formData.get("gate_label") ?? "").trim() || null;

  if (!residentId) fail("/guard/package", "Elegí el residente destinatario");
  if (!description) fail("/guard/package", "Cargá una descripción del paquete");

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("packages")
    .insert({
      organization_id: orgId,
      resident_id: residentId,
      received_by: userId,
      description,
      courier,
      photo_url: photoUrl,
      gate_id: gateId,
      gate_label: gateLabel,
    })
    .select("id, resident_id, residents(user_id, first_name)")
    .single();

  if (error || !created) fail("/guard/package", error?.message ?? "No se pudo registrar el paquete");

  // Notificación push al residente
  const r = Array.isArray(created.residents) ? created.residents[0] : created.residents;
  if (r?.user_id) {
    await pushToUser(r.user_id, {
      title: `📦 Te llegó un paquete a ${orgName}`,
      body: description + (courier ? ` · ${courier}` : ""),
      url: "/resident/packages",
    });
  }

  await logAudit({
    orgId,
    userId,
    action: "package.create",
    entityType: "package",
    entityId: created.id,
    metadata: { description, courier, resident_id: residentId },
  });

  revalidatePath("/guard/package");
  revalidatePath("/admin/packages");
  revalidatePath("/resident/packages");
  redirect("/guard/package?ok=1");
}

// ---------------------------------------------------------------------------
// Entregar un paquete
// ---------------------------------------------------------------------------
export async function deliverPackageAction(formData: FormData): Promise<void> {
  const { orgId, userId } = await requireOperator();

  const packageId = String(formData.get("package_id") ?? "");
  const deliveredTo = String(formData.get("delivered_to") ?? "").trim() || null;
  const notes = String(formData.get("delivery_notes") ?? "").trim() || null;
  if (!packageId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("packages")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      delivered_by: userId,
      delivered_to: deliveredTo,
      delivery_notes: notes,
    })
    .eq("id", packageId)
    .eq("organization_id", orgId);

  if (error) console.error("delivery error", error);

  revalidatePath("/guard/package");
  revalidatePath("/admin/packages");
  revalidatePath("/resident/packages");
}

// ---------------------------------------------------------------------------
// Devolver al courier
// ---------------------------------------------------------------------------
export async function returnPackageAction(formData: FormData): Promise<void> {
  const { orgId, userId } = await requireOperator();
  const packageId = String(formData.get("package_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || "Devuelto al courier";
  if (!packageId) return;

  const supabase = await createClient();
  await supabase
    .from("packages")
    .update({
      status: "returned",
      delivered_at: new Date().toISOString(),
      delivered_by: userId,
      delivery_notes: notes,
    })
    .eq("id", packageId)
    .eq("organization_id", orgId);

  revalidatePath("/guard/package");
  revalidatePath("/admin/packages");
}

// ---------------------------------------------------------------------------
// Subir foto: devuelve URL pública. Lo llama el cliente.
// ---------------------------------------------------------------------------
export async function uploadPackagePhotoAction(formData: FormData): Promise<{ url: string }> {
  const { orgId } = await requireOperator();

  const file = formData.get("file") as File | null;
  if (!file || !file.size) throw new Error("Sin archivo");
  if (file.size > 5 * 1024 * 1024) throw new Error("Foto demasiado grande (máx. 5MB)");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error("Formato no soportado (usá JPG, PNG o WEBP)");
  }

  // Path: <orgId>/<yyyymmdd>/<random>.<ext>
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomUUID();
  const path = `${orgId}/${date}/${rand}.${ext}`;

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("packages")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data } = admin.storage.from("packages").getPublicUrl(path);
  return { url: data.publicUrl };
}

// ---------------------------------------------------------------------------
// Acción que usa el residente para marcar SUS paquetes como retirados
// ---------------------------------------------------------------------------
export async function residentMarkDeliveredAction(formData: FormData): Promise<void> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const packageId = String(formData.get("package_id") ?? "");
  if (!packageId) return;

  // RLS asegura que solo puede actualizar paquetes asociados a un resident_id
  // cuyo user_id sea el suyo.
  await supabase
    .from("packages")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      delivered_to: "Retirado por el residente",
    })
    .eq("id", packageId)
    .eq("organization_id", org.id)
    .eq("status", "pending");

  revalidatePath("/resident/packages");
}
