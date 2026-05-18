import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { createPreference } from "@/lib/mp-checkout";

export const dynamic = "force-dynamic";

type Body = {
  listing_id: string;
  starts_at?: string;
  ends_at?: string;
  quantity?: number;
};

export async function POST(req: Request) {
  const org = await getCurrentOrg();
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("residents")
    .select("id")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) return NextResponse.json({ error: "not_resident" }, { status: 403 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!body.listing_id) return NextResponse.json({ error: "missing_listing" }, { status: 400 });

  // Cargar listing
  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", body.listing_id)
    .eq("organization_id", org.id)
    .eq("active", true)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });

  // Cargar config MP del barrio (con admin client para leer access_token bajo RLS)
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("org_payment_settings")
    .select("mp_access_token, active")
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!settings?.active || !settings.mp_access_token) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  // Determinar starts_at / ends_at según kind
  let startsAt: string;
  let endsAt: string;
  const quantity = body.quantity ?? 1;

  if (listing.kind === "space") {
    if (!body.starts_at || !body.ends_at) {
      return NextResponse.json({ error: "missing_slot" }, { status: 400 });
    }
    startsAt = body.starts_at;
    endsAt = body.ends_at;

    // Validar que no haya conflicto (otra reserva pisando el slot)
    const { count } = await admin
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("listing_id", listing.id)
      .in("status", ["pending_payment", "confirmed"])
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt);
    if ((count ?? 0) >= (listing.max_concurrent ?? 1)) {
      return NextResponse.json({ error: "slot_taken" }, { status: 409 });
    }
  } else if (listing.kind === "event") {
    if (!listing.event_starts_at) {
      return NextResponse.json({ error: "event_no_date" }, { status: 400 });
    }
    startsAt = listing.event_starts_at;
    endsAt = listing.event_ends_at ?? listing.event_starts_at;

    // Validar cupo
    if (listing.event_capacity) {
      const { data: existing } = await admin
        .from("reservations")
        .select("quantity")
        .eq("listing_id", listing.id)
        .in("status", ["pending_payment", "confirmed"]);
      const sold = (existing ?? []).reduce((s, r) => s + r.quantity, 0);
      if (sold + quantity > listing.event_capacity) {
        return NextResponse.json({ error: "sold_out" }, { status: 409 });
      }
    }
  } else {
    return NextResponse.json({ error: "kind_not_supported" }, { status: 400 });
  }

  const amount = listing.price_ars * quantity;

  // Crear reserva en estado pending_payment
  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .insert({
      organization_id: org.id,
      listing_id: listing.id,
      resident_id: me.id,
      starts_at: startsAt,
      ends_at: endsAt,
      quantity,
      amount_ars: amount,
      status: "pending_payment",
    })
    .select("id")
    .single();
  if (resErr || !reservation) {
    return NextResponse.json({ error: resErr?.message ?? "insert_failed" }, { status: 500 });
  }

  // URLs de vuelta
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${proto}://${host}`;

  try {
    const pref = await createPreference({
      accessToken: settings.mp_access_token,
      items: [
        {
          title: listing.name,
          quantity,
          unit_price: listing.price_ars,
          currency_id: "ARS",
        },
      ],
      payerEmail: user.email,
      externalReference: reservation.id,
      successUrl: `${baseUrl}/resident/marketplace?paid=1`,
      failureUrl: `${baseUrl}/resident/marketplace/${listing.id}?error=${encodeURIComponent("Pago rechazado")}`,
      pendingUrl: `${baseUrl}/resident/marketplace?pending=1`,
      notificationUrl: `${baseUrl}/api/marketplace/webhook`,
      metadata: {
        organization_id: org.id,
        listing_id: listing.id,
        reservation_id: reservation.id,
      },
      expiresMinutes: 30,
    });

    // Guardar preference_id en la reserva
    await admin
      .from("reservations")
      .update({ mp_preference_id: pref.id })
      .eq("id", reservation.id);

    return NextResponse.json({
      ok: true,
      reservation_id: reservation.id,
      init_point: pref.init_point,
    });
  } catch (e) {
    // Si MP falla, cancelamos la reserva
    await admin
      .from("reservations")
      .update({ status: "cancelled", cancel_reason: "mp_preference_failed" })
      .eq("id", reservation.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "mp_failed" },
      { status: 502 },
    );
  }
}
