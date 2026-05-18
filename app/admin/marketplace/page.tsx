import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { KIND_META, formatArs, type ListingKind } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

export default async function AdminMarketplacePage() {
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: listings }, { data: settings }, { count: pendingCount }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, kind, name, description, photo_url, price_ars, active, event_starts_at, event_capacity, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false }),
    admin
      .from("org_payment_settings")
      .select("active, mp_access_token")
      .eq("organization_id", org.id)
      .maybeSingle(),
    supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "confirmed")
      .gte("starts_at", new Date().toISOString()),
  ]);

  const paymentsReady = Boolean(settings?.active && settings?.mp_access_token);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Marketplace de reservas</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/payment-settings"
            className="bg-zinc-800 hover:bg-zinc-700 text-sm px-4 py-2 rounded-lg font-medium"
          >
            ⚙️ Pagos
          </Link>
          <Link
            href="/admin/marketplace/new"
            className="bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold px-4 py-2 rounded-lg"
          >
            + Nuevo
          </Link>
        </div>
      </div>
      <p className="text-zinc-400 text-sm mb-6">
        Espacios, eventos y membresías que los residentes pueden reservar y pagar desde su panel.
        Los cobros van directo a la cuenta de Mercado Pago del barrio.
      </p>

      {!paymentsReady && (
        <div className="bg-amber-600/20 border border-amber-600/40 rounded-2xl p-4 mb-4 text-sm flex items-center justify-between gap-3 flex-wrap">
          <div>
            ⚠️ <strong>Cobros desactivados.</strong> Configurá la cuenta de Mercado Pago del
            barrio para que los residentes puedan reservar y pagar.
          </div>
          <Link
            href="/admin/payment-settings"
            className="bg-amber-600 hover:bg-amber-500 text-xs font-semibold px-3 py-1.5 rounded text-black"
          >
            Configurar ahora
          </Link>
        </div>
      )}

      {paymentsReady && pendingCount !== null && pendingCount > 0 && (
        <div className="bg-emerald-600/10 border border-emerald-600/30 rounded-2xl p-4 mb-4 text-sm">
          ✅ Hay <strong>{pendingCount}</strong> reservas confirmadas próximas.
        </div>
      )}

      {(listings ?? []).length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <div className="text-5xl mb-3">🏛️</div>
          <h2 className="font-bold text-lg mb-2">Sin items todavía</h2>
          <p className="text-zinc-400 text-sm mb-4">
            Empezá creando un espacio (ej: SUM, pileta), un evento (cena, taller) o una membresía
            (gimnasio).
          </p>
          <Link
            href="/admin/marketplace/new"
            className="inline-block bg-emerald-600 hover:bg-emerald-500 font-semibold px-6 py-3 rounded-xl"
          >
            Crear el primero
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings!.map((l) => {
            const meta = KIND_META[l.kind as ListingKind];
            return (
              <Link
                key={l.id}
                href={`/admin/marketplace/${l.id}`}
                className={`bg-zinc-950 border rounded-2xl overflow-hidden hover:border-emerald-500/40 transition ${
                  l.active ? "border-zinc-800" : "border-zinc-800 opacity-60"
                }`}
              >
                {l.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.photo_url} alt="" className="w-full h-32 object-cover bg-zinc-800" />
                ) : (
                  <div className="w-full h-32 bg-zinc-800 flex items-center justify-center text-5xl">
                    {meta.emoji}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {meta.emoji} {meta.label}
                    </span>
                    {!l.active && (
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-700/40 text-zinc-400">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold mb-1">{l.name}</h3>
                  {l.description && (
                    <p className="text-xs text-zinc-400 line-clamp-2 mb-2">{l.description}</p>
                  )}
                  <div className="text-lg font-bold text-emerald-400">{formatArs(l.price_ars)}</div>
                  {l.kind === "event" && l.event_starts_at && (
                    <div className="text-xs text-zinc-400 mt-1">
                      📅 {new Date(l.event_starts_at).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {l.event_capacity && ` · cupo ${l.event_capacity}`}
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
