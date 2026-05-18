import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { KIND_META, formatArs, type ListingKind } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

export default async function ResidentMarketplacePage() {
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();

  const { data: listings } = await supabase
    .from("listings")
    .select("id, kind, name, description, photo_url, price_ars, event_starts_at, event_capacity")
    .eq("organization_id", org.id)
    .eq("active", true)
    .order("kind")
    .order("name");

  // Mis reservas próximas (para mostrar arriba)
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("residents")
    .select("id")
    .eq("organization_id", org.id)
    .eq("user_id", user!.id)
    .maybeSingle();

  const { data: myReservations } = me
    ? await supabase
        .from("reservations")
        .select("id, status, starts_at, listings(name, kind, photo_url)")
        .eq("resident_id", me.id)
        .in("status", ["pending_payment", "confirmed"])
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(5)
    : { data: null };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">🛒 Reservas</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Reservá espacios, comprá entradas a eventos del barrio y suscribite a membresías.
      </p>

      {myReservations && myReservations.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm uppercase tracking-wider text-zinc-500 mb-3">
            Mis próximas reservas
          </h2>
          <div className="space-y-2">
            {myReservations.map((r) => {
              const l = Array.isArray(r.listings) ? r.listings[0] : r.listings;
              const km = l ? KIND_META[l.kind as ListingKind] : null;
              return (
                <div
                  key={r.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-md bg-zinc-800 flex items-center justify-center text-xl flex-shrink-0">
                    {l?.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.photo_url} alt="" className="w-full h-full object-cover rounded-md" />
                    ) : (
                      km?.emoji
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{l?.name}</div>
                    <div className="text-xs text-zinc-400">
                      {new Date(r.starts_at).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      r.status === "confirmed"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {r.status === "confirmed" ? "Confirmada" : "Esperando pago"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <h2 className="text-sm uppercase tracking-wider text-zinc-500 mb-3">Disponibles</h2>
      {(listings ?? []).length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-8">
          La administración todavía no cargó espacios ni eventos disponibles.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {listings!.map((l) => {
            const meta = KIND_META[l.kind as ListingKind];
            return (
              <Link
                key={l.id}
                href={`/resident/marketplace/${l.id}`}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-emerald-500/50 transition"
              >
                {l.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.photo_url} alt="" className="w-full h-36 object-cover bg-zinc-800" />
                ) : (
                  <div className="w-full h-36 bg-zinc-800 flex items-center justify-center text-5xl">
                    {meta.emoji}
                  </div>
                )}
                <div className="p-4">
                  <div className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 inline-block mb-2">
                    {meta.emoji} {meta.label}
                  </div>
                  <h3 className="font-bold mb-1">{l.name}</h3>
                  {l.description && (
                    <p className="text-xs text-zinc-500 line-clamp-2 mb-2">{l.description}</p>
                  )}
                  <div className="text-lg font-bold text-emerald-400">
                    {formatArs(l.price_ars)}
                  </div>
                  {l.kind === "event" && l.event_starts_at && (
                    <div className="text-xs text-zinc-500 mt-1">
                      📅 {new Date(l.event_starts_at).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
