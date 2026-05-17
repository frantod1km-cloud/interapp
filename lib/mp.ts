// Wrapper mínimo de Mercado Pago (Preapproval API).
//
// Docs: https://www.mercadopago.com.ar/developers/es/reference/subscriptions/_preapproval/post
//
// Estrategia: usamos preapproval con `auto_recurring` para débito mensual
// automático. El usuario es redirigido al `init_point` de MP para autorizar
// el medio de pago, y MP nos avisa por webhook cuando hay cobros (o cuando
// falla).

const MP_BASE = "https://api.mercadopago.com";

function token(): string {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error("Falta MP_ACCESS_TOKEN");
  return t;
}

export type CreatePreapprovalInput = {
  payerEmail: string;
  amountArs: number;
  reason: string;             // ej: "interapp — Plan Básico (Barrio Los Álamos)"
  externalReference: string;  // organization_id
  backUrl: string;            // a dónde vuelve después de autorizar
};

export type Preapproval = {
  id: string;
  init_point: string;
  status: string;
};

export async function createPreapproval(input: CreatePreapprovalInput): Promise<Preapproval> {
  const body = {
    payer_email: input.payerEmail,
    back_url: input.backUrl,
    external_reference: input.externalReference,
    reason: input.reason,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months" as const,
      transaction_amount: input.amountArs,
      currency_id: "ARS" as const,
    },
    status: "pending" as const,
  };

  const resp = await fetch(`${MP_BASE}/preapproval`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`MP preapproval falló: ${resp.status} ${text}`);
  }

  return (await resp.json()) as Preapproval;
}

export async function getPreapproval(id: string): Promise<{
  id: string;
  status: string;            // pending | authorized | paused | cancelled
  external_reference: string;
  next_payment_date?: string;
}> {
  const resp = await fetch(`${MP_BASE}/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!resp.ok) throw new Error(`MP get preapproval falló: ${resp.status}`);
  return await resp.json();
}
