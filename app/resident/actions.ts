"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

export async function revokeAuthAction(formData: FormData) {
  const { orgId } = await currentResidentId();
  const authId = String(formData.get("auth_id") ?? "");
  if (!authId) return;

  const supabase = await createClient();
  await supabase
    .from("authorizations")
    .update({ revoked: true })
    .eq("id", authId)
    .eq("organization_id", orgId);

  revalidatePath("/resident");
}
