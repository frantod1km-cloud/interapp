import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import { kindMeta } from "@/lib/resident-kinds";
import { packageAge } from "@/lib/packages/age";
import { returnPackageAction } from "./actions";
import DeliverButton from "@/app/guard/package/DeliverButton";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { id: "pending", label: "Pendientes", className: "bg-sky-600 border-sky-500" },
  { id: "delivered", label: "Entregados", className: "bg-emerald-600 border-emerald-500" },
  { id: "returned", label: "Devueltos", className: "bg-amber-600 border-amber-500" },
  { id: "all", label: "Todos", className: "bg-zinc-700 border-zinc-600" },
] as const;

export default async function AdminPackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();

  const status = sp.status && ["pending", "delivered", "returned"].includes(sp.status)
    ? sp.status
    : null;

  let query = supabase
    .from("packages")
    .select(
      "id, description, courier, photo_url, status, received_at, delivered_at, delivered_to, gate_label, pickup_pin, pickup_pin_holder, residents(first_name, last_name, dni, unit, kind)",
    )
    .eq("organization_id", org.id)
    .order("received_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  if (sp.q && sp.q.trim()) {
    const term = sp.q.trim();
    const safe = term.replace(/[%_]/g, (c) => `\\${c}`);
    // Buscamos en descripción y courier
    query = query.or(`description.ilike.%${safe}%,courier.ilike.%${safe}%`);
  }

  const { data: pkgs } = await query;

  // Conteos para los chips
  const { data: allForCount } = await supabase
    .from("packages")
    .select("status")
    .eq("organization_id", org.id);
  const counts: Record<string, number> = { pending: 0, delivered: 0, returned: 0 };
  for (const p of allForCount ?? []) counts[p.status] = (counts[p.status] ?? 0) + 1;
  const total = (allForCount ?? []).length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Paquetería</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Paquetes recibidos en la garita. Los guardias los registran al recibirlos y se notifica
        al residente. Acá los podés ver, marcar entregados o devueltos.
      </p>

      {/* Buscador */}
      <form method="get" className="flex gap-2 mb-3">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar por descripción o mensajería…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm"
        />
        <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
          Buscar
        </button>
        {sp.q && (
          <Link
            href={status ? `/admin/packages?status=${status}` : "/admin/packages"}
            className="text-sm text-zinc-400 hover:text-white self-center px-3"
          >
            Limpiar
          </Link>
        )}
      </form>

      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((f) => {
          const isActive = (status ?? "all") === f.id;
          const count = f.id === "all" ? total : counts[f.id] ?? 0;
          const baseHref = f.id === "all" ? "/admin/packages" : `/admin/packages?status=${f.id}`;
          const href = sp.q
            ? `${baseHref}${baseHref.includes("?") ? "&" : "?"}q=${encodeURIComponent(sp.q)}`
            : baseHref;
          return (
            <Link
              key={f.id}
              href={href}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                isActive ? `${f.className} text-white` : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {f.label} ({count})
            </Link>
          );
        })}
      </div>

      {(pkgs ?? []).length === 0 ? (
        <p className="text-zinc-400 text-sm text-center py-12 bg-zinc-900 border border-zinc-800 rounded-2xl">
          {status === "pending"
            ? "No hay paquetes esperando."
            : status
              ? "Sin resultados en este filtro."
              : "Aún no se registró ningún paquete."}
        </p>
      ) : (
        <div className="space-y-3">
          {pkgs!.map((p) => {
            const r = Array.isArray(p.residents) ? p.residents[0] : p.residents;
            const km = r ? kindMeta(r.kind) : null;
            return (
              <div
                key={p.id}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex gap-4 items-start"
              >
                {p.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.photo_url}
                    alt=""
                    className="w-24 h-24 rounded-lg object-cover bg-zinc-800 flex-shrink-0"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-lg bg-zinc-800 flex items-center justify-center text-4xl flex-shrink-0">
                    📦
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold">{p.description}</span>
                    <StatusBadge status={p.status} />
                    {p.status === "pending" && (
                      <span className={`text-xs px-2 py-0.5 rounded ${packageAge(p.received_at).className}`}>
                        {packageAge(p.received_at).label}
                      </span>
                    )}
                    {p.pickup_pin && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        🔑 PIN activo
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-zinc-400">
                    {p.courier && <>{p.courier} · </>}
                    Recibido {new Date(p.received_at).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {p.gate_label && ` · ${p.gate_label}`}
                  </div>
                  {r && (
                    <div className="text-sm mt-1">
                      {km && <span>{km.emoji} </span>}
                      <span className="text-zinc-400">
                        {r.last_name}, {r.first_name}
                      </span>
                      {r.unit && <span className="text-zinc-400"> · {r.unit}</span>}
                      <span className="text-zinc-400 tabular-nums"> · DNI {formatDni(r.dni)}</span>
                    </div>
                  )}
                  {p.delivered_at && (
                    <div className="text-xs text-zinc-400 mt-1">
                      {p.status === "delivered" ? "Entregado" : "Devuelto"}{" "}
                      {new Date(p.delivered_at).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {p.delivered_to && ` · a ${p.delivered_to}`}
                    </div>
                  )}
                </div>
                {p.status === "pending" && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <DeliverButton
                      packageId={p.id}
                      hasPin={Boolean(p.pickup_pin)}
                      pinHolder={p.pickup_pin_holder}
                      defaultDeliveredTo={r ? `${r.first_name} ${r.last_name}` : ""}
                    />
                    <form action={returnPackageAction}>
                      <input type="hidden" name="package_id" value={p.id} />
                      <button className="bg-zinc-800 hover:bg-amber-700 text-xs px-3 py-1.5 rounded-lg w-full">
                        Devolver
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendiente", className: "bg-sky-500/20 text-sky-300" },
    delivered: { label: "Entregado", className: "bg-emerald-500/20 text-emerald-400" },
    returned: { label: "Devuelto", className: "bg-amber-500/20 text-amber-300" },
  };
  const m = map[status] ?? { label: status, className: "bg-zinc-700 text-zinc-400" };
  return <span className={`text-xs px-2 py-0.5 rounded ${m.className}`}>{m.label}</span>;
}
