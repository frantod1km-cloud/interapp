import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { KIND_META, formatArs, type ListingKind } from "@/lib/marketplace";
import ReserveForm from "./ReserveForm";

export const dynamic = "force-dynamic";

export default async function ResidentListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .eq("organization_id", org.id)
    .eq("active", true)
    .maybeSingle();

  if (!listing) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("residents")
    .select("id")
    .eq("organization_id", org.id)
    .eq("user_id", user!.id)
    .maybeSingle();

  // ¿Pagos configurados en el barrio?
  const { data: paymentSettings } = await supabase
    .from("org_payment_settings")
    .select("active")
    .eq("organization_id", org.id)
    .maybeSingle();
  const canPay = Boolean(paymentSettings?.active);

  // Slots ocupados (para spaces — pasados como JSON al form)
  let occupiedSlots: Array<{ starts_at: string; ends_at: string }> = [];
  if (listing.kind === "space") {
    const { data } = await supabase
      .from("reservations")
      .select("starts_at, ends_at")
      .eq("listing_id", listing.id)
      .in("status", ["pending_payment", "confirmed"])
      .gte("ends_at", new Date().toISOString());
    occupiedSlots = data ?? [];
  }

  // Vacantes restantes (para events)
  let eventVacancy: number | null = null;
  if (listing.kind === "event" && listing.event_capacity) {
    const { data } = await supabase
      .from("reservations")
      .select("quantity")
      .eq("listing_id", listing.id)
      .in("status", ["pending_payment", "confirmed"]);
    const sold = (data ?? []).reduce((s, r) => s + r.quantity, 0);
    eventVacancy = listing.event_capacity - sold;
  }

  const meta = KIND_META[listing.kind as ListingKind];

  return (
    <div>
      <Link href="/resident/marketplace" className="text-sm text-zinc-400 hover:text-zinc-400 inline-block mb-4">
        ← Volver
      </Link>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-6">
        {listing.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.photo_url} alt="" className="w-full h-48 object-cover bg-zinc-800" />
        ) : (
          <div className="w-full h-48 bg-zinc-800 flex items-center justify-center text-7xl">
            {meta.emoji}
          </div>
        )}
        <div className="p-5">
          <div className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 inline-block mb-2">
            {meta.emoji} {meta.label}
          </div>
          <h1 className="text-2xl font-bold mb-2">{listing.name}</h1>
          {listing.description && (
            <p className="text-zinc-400 text-sm mb-4 whitespace-pre-wrap">{listing.description}</p>
          )}
          <div className="text-2xl font-bold text-emerald-400">{formatArs(listing.price_ars)}</div>
        </div>
      </div>

      {!me && (
        <div className="bg-amber-600/20 border border-amber-600/40 rounded-2xl p-4 mb-4 text-sm">
          Pedile a la administración del barrio que te asocie como residente para poder reservar.
        </div>
      )}

      {!canPay && (
        <div className="bg-amber-600/20 border border-amber-600/40 rounded-2xl p-4 mb-4 text-sm">
          La administración aún no configuró los cobros del marketplace. Probá más tarde.
        </div>
      )}

      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {me && canPay && (
        <ReserveForm
          listing={{
            id: listing.id,
            kind: listing.kind,
            name: listing.name,
            price_ars: listing.price_ars,
            slot_minutes: listing.slot_minutes,
            max_concurrent: listing.max_concurrent,
            advance_days: listing.advance_days,
            open_hour: listing.open_hour,
            close_hour: listing.close_hour,
            event_starts_at: listing.event_starts_at,
            event_ends_at: listing.event_ends_at,
            event_capacity: listing.event_capacity,
          }}
          occupiedSlots={occupiedSlots}
          eventVacancy={eventVacancy}
        />
      )}
    </div>
  );
}
