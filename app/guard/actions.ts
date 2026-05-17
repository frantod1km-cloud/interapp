"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupDni, type LookupResult } from "@/lib/access/lookup";
import { parseDni } from "@/lib/dni/parse";
import { getCurrentOrg } from "@/lib/org";

export type ScanResponse =
  | { ok: true; result: LookupResult; parsed: { firstName?: string; lastName?: string } }
  | { ok: false; error: string };

export async function scanAction(rawInput: string): Promise<ScanResponse> {
  const org = await getCurrentOrg();
  if (!org) return { ok: false, error: "Organización no encontrada para este dominio." };

  const parsed = parseDni(rawInput);
  if (!parsed) return { ok: false, error: "No se pudo leer el DNI." };

  const result = await lookupDni(org.id, parsed.dni);
  return {
    ok: true,
    result,
    parsed: { firstName: parsed.firstName, lastName: parsed.lastName },
  };
}

export type RegisterInput = {
  dni: string;
  fullName?: string;
  direction: "in" | "out";
  result: "authorized" | "denied" | "forced" | "manual";
  reason?: string;
  authorizationId?: string;
  residentId?: string;
  vehiclePlate?: string;
};

export async function registerAccessAction(input: RegisterInput): Promise<{ ok: boolean; error?: string }> {
  const org = await getCurrentOrg();
  if (!org) return { ok: false, error: "Organización no encontrada." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from("access_events").insert({
    organization_id: org.id,
    guard_id: user?.id ?? null,
    authorization_id: input.authorizationId ?? null,
    resident_id: input.residentId ?? null,
    dni: input.dni,
    full_name: input.fullName ?? null,
    direction: input.direction,
    result: input.result,
    reason: input.reason ?? null,
    vehicle_plate: input.vehiclePlate ?? null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/events");
  return { ok: true };
}
