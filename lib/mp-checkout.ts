// Mercado Pago Checkout API para pagos one-shot del marketplace.
//
// A diferencia de lib/mp.ts (que usa el token DE LA PLATAFORMA para cobrar
// nuestras suscripciones), acá usamos el access_token de cada barrio para
// que el dinero vaya directo a su cuenta.
//
// Docs: https://www.mercadopago.com.ar/developers/es/reference/preferences/_checkout_preferences/post

const MP_BASE = "https://api.mercadopago.com";

export type CreatePreferenceInput = {
  accessToken: string;
  items: Array<{
    title: string;
    quantity: number;
    unit_price: number;
    currency_id: string;
  }>;
  payerEmail?: string;
  externalReference: string; // reservation_id
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
  notificationUrl: string;
  metadata?: Record<string, string>;
  // Vencimiento del pago: si el usuario no paga en X minutos, MP marca expired
  expiresMinutes?: number;
};

export type Preference = {
  id: string;
  init_point: string;
  sandbox_init_point: string;
};

export async function createPreference(input: CreatePreferenceInput): Promise<Preference> {
  const body: Record<string, unknown> = {
    items: input.items,
    external_reference: input.externalReference,
    back_urls: {
      success: input.successUrl,
      failure: input.failureUrl,
      pending: input.pendingUrl,
    },
    auto_return: "approved",
    notification_url: input.notificationUrl,
    statement_descriptor: "INTERAPP",
    metadata: input.metadata ?? {},
    binary_mode: false,
  };

  if (input.payerEmail) body.payer = { email: input.payerEmail };

  if (input.expiresMinutes) {
    body.expires = true;
    body.expiration_date_to = new Date(Date.now() + input.expiresMinutes * 60_000).toISOString();
  }

  const resp = await fetch(`${MP_BASE}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`MP createPreference falló: ${resp.status} ${text}`);
  }
  return (await resp.json()) as Preference;
}

export type MPPayment = {
  id: number;
  status: string;       // approved | pending | rejected | cancelled | refunded | charged_back
  external_reference: string;
  transaction_amount: number;
  preference_id?: string;
};

export async function getPayment(accessToken: string, paymentId: string): Promise<MPPayment> {
  const resp = await fetch(`${MP_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`MP getPayment falló: ${resp.status}`);
  return await resp.json();
}
