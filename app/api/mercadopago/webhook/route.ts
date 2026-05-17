import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPreapproval } from "@/lib/mp";

// Mercado Pago manda notificaciones tipo:
//   POST /api/mercadopago/webhook?type=preapproval&data.id=<id>
// y/o en el body:
//   { "type": "preapproval", "data": { "id": "..." } }
//
// Nuestra estrategia: ignoramos el contenido y consultamos la API de MP por el
// estado actual del preapproval. Así nos enteramos sin importar el formato.
//
// Estados de preapproval relevantes:
//   pending     → recién creado, todavía no autorizó pago
//   authorized  → activo y al día
//   paused      → fallaron cobros recientes (lo dejamos past_due)
//   cancelled   → el usuario o nosotros lo cancelamos
//
// Mapeo a subscriptions.status:
//   authorized → active
//   paused     → past_due
//   cancelled  → cancelled
//   pending    → pending

export async function POST(req: Request) {
  const url = new URL(req.url);
  let preapprovalId = url.searchParams.get("data.id") ?? url.searchParams.get("id");

  if (!preapprovalId) {
    try {
      const body = (await req.json()) as { data?: { id?: string }; type?: string };
      if (body?.data?.id) preapprovalId = body.data.id;
    } catch {
      // body vacío o no JSON, ignoramos
    }
  }

  if (!preapprovalId) return NextResponse.json({ ok: true, ignored: true });

  let pre;
  try {
    pre = await getPreapproval(preapprovalId);
  } catch (e) {
    console.error("MP webhook: error consultando preapproval", e);
    return NextResponse.json({ ok: false, error: "mp_fetch_failed" }, { status: 502 });
  }

  const orgId = pre.external_reference;
  if (!orgId) return NextResponse.json({ ok: true, ignored: true });

  const status =
    pre.status === "authorized"
      ? "active"
      : pre.status === "paused"
        ? "past_due"
        : pre.status === "cancelled"
          ? "cancelled"
          : "pending";

  const admin = createAdminClient();

  await admin
    .from("subscriptions")
    .update({
      status,
      mp_preapproval_id: pre.id,
      current_period_end: pre.next_payment_date ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId);

  // También actualizar el estado de la org para que el gate funcione
  const orgStatus =
    status === "active" ? "active" : status === "past_due" ? "past_due" : status === "cancelled" ? "suspended" : "past_due";

  await admin.from("organizations").update({ status: orgStatus }).eq("id", orgId);

  return NextResponse.json({ ok: true, status });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST only" });
}
