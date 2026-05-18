import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { KIND_META, formatArs, type ListingKind } from "@/lib/marketplace";
import { deleteListingAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!listing) notFound();

  const meta = KIND_META[listing.kind as ListingKind];

  const { data: reservations } = await supabase
    .from("reservations")
    .select("id, status, starts_at, ends_at, quantity, amount_ars, paid_at, residents(first_name, last_name, unit)")
    .eq("listing_id", listing.id)
    .order("starts_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <Link href="/admin/marketplace" className="text-sm text-zinc-700 hover:text-zinc-700 inline-block mb-4">
        ← Volver al marketplace
      </Link>

      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden mb-6">
        {listing.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.photo_url} alt="" className="w-full h-48 sm:h-64 object-cover bg-zinc-100" />
        ) : (
          <div className="w-full h-48 bg-zinc-100 flex items-center justify-center text-7xl">
            {meta.emoji}
          </div>
        )}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs px-2 py-1 rounded bg-zinc-100 text-zinc-700">
              {meta.emoji} {meta.label}
            </span>
            {!listing.active && (
              <span className="text-xs px-2 py-1 rounded bg-rose-700/20 text-rose-700">Inactivo</span>
            )}
          </div>
          <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
            <h1 className="text-2xl font-bold">{listing.name}</h1>
            <div className="text-2xl font-bold text-emerald-700">{formatArs(listing.price_ars)}</div>
          </div>
          {listing.description && (
            <p className="text-zinc-700 text-sm mb-4 whitespace-pre-wrap">{listing.description}</p>
          )}

          {listing.kind === "space" && (
            <div className="text-sm text-zinc-700 space-y-1">
              <div>⏱️ Slots de {listing.slot_minutes} min</div>
              <div>👥 Cupo simultáneo: {listing.max_concurrent}</div>
              <div>
                📅 De {String(listing.open_hour).padStart(2, "0")}:00 a{" "}
                {String(listing.close_hour).padStart(2, "0")}:00
              </div>
              <div>📆 Reservable hasta {listing.advance_days} días adelante</div>
            </div>
          )}
          {listing.kind === "event" && listing.event_starts_at && (
            <div className="text-sm text-zinc-700 space-y-1">
              <div>📅 Inicio: {new Date(listing.event_starts_at).toLocaleString("es-AR")}</div>
              {listing.event_ends_at && (
                <div>🏁 Fin: {new Date(listing.event_ends_at).toLocaleString("es-AR")}</div>
              )}
              {listing.event_capacity && <div>🎟️ Cupo: {listing.event_capacity}</div>}
            </div>
          )}
          {listing.kind === "membership" && (
            <div className="text-sm text-zinc-700">
              💳 Renovación cada {listing.membership_months} mes(es)
            </div>
          )}

          <div className="flex gap-2 mt-6">
            <Link
              href={`/admin/marketplace/${listing.id}/edit`}
              className="bg-zinc-100 hover:bg-zinc-200 text-sm px-4 py-2 rounded-lg font-medium"
            >
              Editar
            </Link>
            <form action={deleteListingAction}>
              <input type="hidden" name="id" value={listing.id} />
              <button className="bg-zinc-100 hover:bg-rose-700 text-sm px-4 py-2 rounded-lg">
                Eliminar
              </button>
            </form>
          </div>
        </div>
      </div>

      <h2 className="text-xl font-bold mb-3">Reservas ({reservations?.length ?? 0})</h2>
      {!reservations || reservations.length === 0 ? (
        <p className="text-zinc-700 text-sm bg-white border border-zinc-200 rounded-2xl p-6 text-center">
          Sin reservas todavía.
        </p>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white text-zinc-700 text-left">
              <tr>
                <th className="px-4 py-3">Cuándo</th>
                <th className="px-4 py-3">Residente</th>
                <th className="px-4 py-3">Cant.</th>
                <th className="px-4 py-3">Monto</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => {
                const res = Array.isArray(r.residents) ? r.residents[0] : r.residents;
                return (
                  <tr key={r.id} className="border-t border-zinc-200">
                    <td className="px-4 py-3 tabular-nums">
                      {new Date(r.starts_at).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {res ? `${res.last_name}, ${res.first_name}` : "—"}
                      {res?.unit && <span className="text-zinc-700"> · {res.unit}</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.quantity}</td>
                    <td className="px-4 py-3 tabular-nums">{formatArs(r.amount_ars)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_payment: { label: "Esperando pago", cls: "bg-amber-500/20 text-amber-700" },
    confirmed: { label: "Confirmada", cls: "bg-emerald-500/20 text-emerald-700" },
    cancelled: { label: "Cancelada", cls: "bg-zinc-200/40 text-zinc-700" },
    completed: { label: "Completada", cls: "bg-sky-500/20 text-sky-700" },
  };
  const m = map[status] ?? { label: status, cls: "bg-zinc-200 text-zinc-700" };
  return <span className={`text-xs px-2 py-0.5 rounded ${m.cls}`}>{m.label}</span>;
}
