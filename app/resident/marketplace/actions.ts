"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";

// Cuántos minutos consideramos viva a una reserva pending_payment antes de
// auto-cancelarla. Coincide con `expiresMinutes` que mandamos a Mercado Pago
// al crear el preference — pasado ese tiempo el link de pago también muere.
//
// (No se exporta porque en "use server" solo se pueden exportar async fns.)
const PENDING_TTL_MINUTES = 30;

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

// Auto-cancela reservas pending_payment del residente que pasaron del TTL.
// Se llama desde la página de marketplace antes de listar para que el usuario
// no vea reservas zombies. También libera el cupo de los eventos para que
// otros puedan reservar.
export async function expireOldPendingReservations(residentId: string): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_TTL_MINUTES * 60_000).toISOString();
  const admin = createAdminClient();
  await admin
    .from("reservations")
    .update({ status: "cancelled", cancel_reason: "pending_timeout" })
    .eq("resident_id", residentId)
    .eq("status", "pending_payment")
    .lt("created_at", cutoff);
}

// Cancela una reserva del residente. Solo permite cancelar las pending_payment
// — las ya confirmadas requieren reembolso y eso lo maneja el admin.
export async function cancelReservationAction(formData: FormData): Promise<void> {
  const { orgId, residentId } = await currentResidentId();
  const reservationId = String(formData.get("reservation_id") ?? "");
  if (!reservationId) return;

  const admin = createAdminClient();
  // Verificamos ownership y estado antes de mutar
  const { data: r } = await admin
    .from("reservations")
    .select("id, resident_id, status")
    .eq("id", reservationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!r || r.resident_id !== residentId) return;
  if (r.status !== "pending_payment") return;

  await admin
    .from("reservations")
    .update({ status: "cancelled", cancel_reason: "cancelled_by_resident" })
    .eq("id", reservationId);

  revalidatePath("/resident/marketplace");
}
