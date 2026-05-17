import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPreapproval } from "@/lib/mp";
import { logAudit } from "@/lib/audit";

// Mercado Pago manda el header `x-signature` con formato:
//   ts=1700000000,v1=abc123hex...
// y `x-request-id` con el ID del request.
// El template que firman es:
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// Computamos HMAC-SHA256 con MP_WEBHOOK_SECRET y comparamos en tiempo
// constante. Si no coincide, rechazamos.
//
// Si MP_WEBHOOK_SECRET no está seteado: aceptamos sin validar pero logueamos
// un warning. Esto permite usar el endpoint en desarrollo o si todavía no
// configuraste la "Clave secreta" en el panel de Notificaciones de MP.

function parseSignatureHeader(h: string | null): { ts?: string; v1?: string } {
  if (!h) return {};
  const out: Record<string, string> = {};
  for (const part of h.split(",")) {
    const [k, v] = part.split("=").map((x) => x.trim());
    if (k && v) out[k] = v;
  }
  return out;
}

function verifyMpSignature(opts: {
  secret: string;
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string;
}): boolean {
  const { ts, v1 } = parseSignatureHeader(opts.signatureHeader);
  if (!ts || !v1 || !opts.requestId) return false;

  const template = `id:${opts.dataId};request-id:${opts.requestId};ts:${ts};`;
  const expected = createHmac("sha256", opts.secret).update(template).digest("hex");

  const a = Buffer.from(v1, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

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

  // Verificación de firma (si está configurado MP_WEBHOOK_SECRET)
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (secret) {
    const ok = verifyMpSignature({
      secret,
      signatureHeader: req.headers.get("x-signature"),
      requestId: req.headers.get("x-request-id"),
      dataId: preapprovalId,
    });
    if (!ok) {
      console.warn("MP webhook: firma inválida", { preapprovalId });
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  } else {
    console.warn("MP_WEBHOOK_SECRET no configurado — el webhook acepta sin verificar firma");
  }

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

  await logAudit({
    orgId,
    userId: null,
    action: "subscription.status_change",
    entityType: "subscription",
    entityId: pre.id,
    metadata: { mp_status: pre.status, subscription_status: status, org_status: orgStatus },
  });

  return NextResponse.json({ ok: true, status });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST only" });
}
