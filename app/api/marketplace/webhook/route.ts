import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment } from "@/lib/mp-checkout";
import { pushToUser } from "@/lib/push";

export const dynamic = "force-dynamic";

// Webhook de Mercado Pago para notificaciones de pago del marketplace.
// MP avisa con type=payment y data.id=<payment_id>. Consultamos el pago
// con el token del barrio (lo sacamos via external_reference → reservation
// → organization).
//
// La firma HMAC se podría agregar acá también (ya lo hicimos en
// /api/mercadopago/webhook para suscripciones de la plataforma) pero el
// secret tendría que ser POR BARRIO y todavía no lo guardamos. Por ahora
// confiamos en que el preference_id sea único e impredecible.

export async function POST(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? url.searchParams.get("topic");
  let paymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id");

  if (!paymentId) {
    try {
      const body = (await req.json()) as { data?: { id?: string } };
      if (body?.data?.id) paymentId = body.data.id;
    } catch {}
  }

  // MP también manda eventos de merchant_order; los ignoramos por ahora,
  // procesamos solo payments.
  if (!paymentId || (type && type !== "payment")) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();

  // Primero buscamos la reserva por preference_id (que está en el payment),
  // pero necesitamos el payment object para obtenerlo. Bootstrap problem:
  // necesitamos el token del barrio para consultar el payment, y no sabemos
  // de qué barrio es hasta que consultemos el payment. Estrategia:
  // 1. Probamos cada barrio activo hasta que uno responda OK.
  //
  // Para escala mayor, lo correcto sería que MP nos mande también el
  // preference_id en el query, o que pongamos los webhooks por barrio en
  // /api/marketplace/webhook/[orgId]. Para ahora hacemos una pasada lineal.

  const { data: settingsList } = await admin
    .from("org_payment_settings")
    .select("organization_id, mp_access_token")
    .eq("active", true)
    .not("mp_access_token", "is", null);

  if (!settingsList || settingsList.length === 0) {
    return NextResponse.json({ ok: true, no_orgs: true });
  }

  for (const s of settingsList) {
    if (!s.mp_access_token) continue;
    try {
      const payment = await getPayment(s.mp_access_token, paymentId);
      if (!payment.external_reference) continue;

      // Esta es la org dueña del payment
      const reservationId = payment.external_reference;
      const { data: reservation } = await admin
        .from("reservations")
        .select("id, status, listing_id, resident_id, organization_id, residents(user_id), listings(name)")
        .eq("id", reservationId)
        .maybeSingle();
      if (!reservation || reservation.organization_id !== s.organization_id) {
        continue; // payment de otro barrio o reserva borrada
      }

      // Mapeo MP → status
      const newStatus =
        payment.status === "approved"
          ? "confirmed"
          : payment.status === "rejected" || payment.status === "cancelled"
            ? "cancelled"
            : "pending_payment";

      const update: Record<string, unknown> = {
        status: newStatus,
        mp_payment_id: String(payment.id),
      };
      if (newStatus === "confirmed" && reservation.status !== "confirmed") {
        update.paid_at = new Date().toISOString();
      }
      if (newStatus === "cancelled") {
        update.cancelled_at = new Date().toISOString();
        update.cancel_reason = `mp_${payment.status}`;
      }

      await admin.from("reservations").update(update).eq("id", reservation.id);

      // Push al residente cuando se confirma
      if (newStatus === "confirmed" && reservation.status !== "confirmed") {
        const r = Array.isArray(reservation.residents) ? reservation.residents[0] : reservation.residents;
        const l = Array.isArray(reservation.listings) ? reservation.listings[0] : reservation.listings;
        if (r?.user_id) {
          await pushToUser(r.user_id, {
            title: "✅ Reserva confirmada",
            body: `Tu pago se acreditó. Reserva: ${l?.name ?? ""}`,
            url: "/resident/marketplace",
          });
        }
      }

      return NextResponse.json({ ok: true, status: newStatus });
    } catch {
      // Este barrio no es el dueño del payment, probamos el siguiente
      continue;
    }
  }

  // Ningún barrio reconoce este payment — probablemente expiró el token
  // o es un evento huérfano. Devolvemos 200 para que MP no reintente.
  return NextResponse.json({ ok: true, unknown_payment: true });
}
