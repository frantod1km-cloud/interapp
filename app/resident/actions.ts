"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { normalizeDni } from "@/lib/dni/parse";

async function currentResidentId(): Promise<{ orgId: string; residentId: string }> {
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

function defaultValidUntil(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

export async function authorizeVisitAction(formData: FormData) {
  const { orgId, residentId } = await currentResidentId();
  const dni = normalizeDni(String(formData.get("dni") ?? ""));
  const name = String(formData.get("visitor_name") ?? "").trim();
  const validUntil = String(formData.get("valid_until") ?? "");

  if (!dni || dni.length < 7) throw new Error("DNI inválido");

  const supabase = await createClient();
  const { error } = await supabase.from("authorizations").insert({
    organization_id: orgId,
    resident_id: residentId,
    dni,
    visitor_name: name || null,
    valid_until: validUntil ? new Date(validUntil).toISOString() : defaultValidUntil(),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/resident");
  redirect("/resident");
}

export async function createInviteAction(formData: FormData) {
  const { orgId, residentId } = await currentResidentId();
  const validUntil = String(formData.get("valid_until") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const token = randomBytes(12).toString("base64url");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("authorizations")
    .insert({
      organization_id: orgId,
      resident_id: residentId,
      dni: null,
      visitor_name: note || null,
      valid_until: validUntil ? new Date(validUntil).toISOString() : defaultValidUntil(),
      notes: note || null,
      invite_token: token,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el link");

  redirect(`/resident/invite/${data.id}`);
}

// Elimina o revoca una autorización del residente que la creó.
//
// Si el invitado todavía NO la usó (no hay claimed_at) → DELETE entero,
// porque no tiene valor histórico una invitación que nunca disparó nada.
// Si el invitado ya la usó (claimed_at, posiblemente además ya ingresó)
// → UPDATE revoked=true para preservar el historial pero anularla.
//
// Usa el admin client para evitar la RLS que solo dejaba al org_admin
// modificar autorizaciones. Validamos manualmente que el auth pertenezca
// al residente que llama, así no se pueden borrar las de otro.
export async function revokeAuthAction(formData: FormData) {
  const { orgId, residentId } = await currentResidentId();
  const authId = String(formData.get("auth_id") ?? "");
  if (!authId) return;

  const admin = createAdminClient();

  // Verificar ownership antes de mutar
  const { data: auth } = await admin
    .from("authorizations")
    .select("id, resident_id, claimed_at, invite_token")
    .eq("id", authId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!auth || auth.resident_id !== residentId) {
    // No tiramos error para no dar pistas de "existe pero no es tuya"
    revalidatePath("/resident");
    return;
  }

  if (!auth.claimed_at) {
    // Nunca se usó → borrado físico
    await admin.from("authorizations").delete().eq("id", authId);
  } else {
    // Ya se usó → revocación lógica
    await admin
      .from("authorizations")
      .update({ revoked: true })
      .eq("id", authId);
  }

  revalidatePath("/resident");
}
