"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

function fail(token: string, msg: string): never {
  redirect(`/v/${token}?error=${encodeURIComponent(msg)}`);
}

export async function claimInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const dni = String(formData.get("dni") ?? "").replace(/\D/g, "");
  const name = String(formData.get("visitor_name") ?? "").trim();

  if (!token) throw new Error("Token inválido");
  if (!dni || dni.length < 7) fail(token, "DNI inválido");
  if (!name) fail(token, "Cargá tu nombre completo");

  const admin = createAdminClient();

  const { data: auth } = await admin
    .from("authorizations")
    .select("id, claimed_at, valid_until")
    .eq("invite_token", token)
    .maybeSingle();

  if (!auth) fail(token, "Invitación no encontrada");
  if (auth.claimed_at) redirect(`/v/${token}?done=1`);
  if (new Date(auth.valid_until) < new Date()) fail(token, "La invitación ya venció");

  const { error } = await admin
    .from("authorizations")
    .update({
      dni,
      visitor_name: name,
      claimed_at: new Date().toISOString(),
      invite_token: null, // un solo uso
    })
    .eq("id", auth.id);

  if (error) fail(token, error.message);

  redirect(`/v/${token}?done=1`);
}
