"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/ratelimit";

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

  // Rate limit: máximo 10 intentos por IP por hora (previene brute-force de tokens)
  const ip = await clientIp();
  const rl = await rateLimit({
    identifier: `ip:${ip}`,
    action: "claim_invite",
    max: 10,
    windowSeconds: 3600,
  });
  if (!rl.allowed) fail(token, "Demasiados intentos. Esperá unos minutos.");

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
