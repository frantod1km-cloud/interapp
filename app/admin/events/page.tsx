import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";

export const dynamic = "force-dynamic";

const RESULT_LABEL: Record<string, { label: string; className: string }> = {
  authorized: { label: "Autorizado", className: "text-emerald-700" },
  forced: { label: "Forzado", className: "text-amber-700" },
  denied: { label: "Rechazado", className: "text-rose-700" },
  manual: { label: "Manual", className: "text-zinc-700" },
};

function rangeFromQuery(from?: string, to?: string): { from: Date; to: Date; isToday: boolean } {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  if (!from && !to) return { from: start, to: end, isToday: true };

  const f = from ? new Date(from + "T00:00:00") : start;
  const t = to ? new Date(to + "T23:59:59") : end;
  return { from: f, to: t, isToday: false };
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();
  const range = rangeFromQuery(sp.from, sp.to);

  let query = supabase
    .from("access_events")
    .select("id, dni, full_name, direction, result, reason, occurred_at, vehicle_plate")
    .eq("organization_id", org.id)
    .gte("occurred_at", range.from.toISOString())
    .lte("occurred_at", range.to.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(500);

  if (sp.q) {
    const term = sp.q.replace(/\D/g, "");
    if (term) query = query.ilike("dni", `%${term}%`);
  }

  const { data: events } = await query;

  const fromStr = range.from.toISOString().slice(0, 10);
  const toStr = range.to.toISOString().slice(0, 10);
  const exportHref = `/admin/events/export?from=${fromStr}&to=${toStr}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">
          Eventos {range.isToday ? "de hoy" : `(${fromStr} a ${toStr})`}
        </h1>
        <Link
          href={exportHref}
          className="bg-zinc-100 hover:bg-zinc-200 text-sm px-4 py-2 rounded-lg font-medium"
        >
          ⬇ Exportar CSV
        </Link>
      </div>

      <form method="get" className="bg-white border border-zinc-200 rounded-2xl p-4 mb-6 flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-zinc-700 mb-1">Desde</label>
          <input type="date" name="from" defaultValue={sp.from ?? fromStr} className="bg-white border border-zinc-200 rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-xs text-zinc-700 mb-1">Hasta</label>
          <input type="date" name="to" defaultValue={sp.to ?? toStr} className="bg-white border border-zinc-200 rounded px-3 py-2" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-zinc-700 mb-1">Buscar DNI</label>
          <input type="text" name="q" defaultValue={sp.q ?? ""} placeholder="Ej: 35123456" className="w-full bg-white border border-zinc-200 rounded px-3 py-2" />
        </div>
        <button className="bg-blue-600 hover:bg-blue-500 font-semibold rounded px-4 py-2">Filtrar</button>
        {(sp.from || sp.to || sp.q) && (
          <Link href="/admin/events" className="text-sm text-zinc-700 hover:text-zinc-900">Limpiar</Link>
        )}
      </form>

      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white text-zinc-700 text-left">
            <tr>
              <th className="px-4 py-3">Fecha y hora</th>
              <th className="px-4 py-3">Persona</th>
              <th className="px-4 py-3">DNI</th>
              <th className="px-4 py-3">Sentido</th>
              <th className="px-4 py-3">Resultado</th>
              <th className="px-4 py-3">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {(events ?? []).map((e) => {
              const r = RESULT_LABEL[e.result] ?? { label: e.result, className: "" };
              return (
                <tr key={e.id} className="border-t border-zinc-200">
                  <td className="px-4 py-3 tabular-nums text-zinc-700">
                    {new Date(e.occurred_at).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">{e.full_name ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDni(e.dni)}</td>
                  <td className="px-4 py-3">
                    {e.direction === "in" ? (
                      <span className="text-emerald-700">↘ Entrada</span>
                    ) : (
                      <span className="text-sky-700">↗ Salida</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 font-medium ${r.className}`}>{r.label}</td>
                  <td className="px-4 py-3 text-zinc-700">{e.reason ?? ""}</td>
                </tr>
              );
            })}
            {(!events || events.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-700">
                  Sin eventos en este rango.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
