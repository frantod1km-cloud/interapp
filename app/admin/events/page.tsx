import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";

export const dynamic = "force-dynamic";

const RESULT_LABEL: Record<string, { label: string; className: string }> = {
  authorized: { label: "Autorizado", className: "text-emerald-400" },
  forced: { label: "Forzado", className: "text-amber-400" },
  denied: { label: "Rechazado", className: "text-rose-400" },
  manual: { label: "Manual", className: "text-zinc-400" },
};

export default async function EventsPage() {
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: events } = await supabase
    .from("access_events")
    .select("id, dni, full_name, direction, result, reason, occurred_at, vehicle_plate")
    .eq("organization_id", org.id)
    .gte("occurred_at", startOfDay.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Eventos de hoy</h1>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-3">Hora</th>
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
                <tr key={e.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 tabular-nums">
                    {new Date(e.occurred_at).toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">{e.full_name ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDni(e.dni)}</td>
                  <td className="px-4 py-3">{e.direction === "in" ? "↘ Entrada" : "↗ Salida"}</td>
                  <td className={`px-4 py-3 font-medium ${r.className}`}>{r.label}</td>
                  <td className="px-4 py-3 text-zinc-500">{e.reason ?? ""}</td>
                </tr>
              );
            })}
            {(!events || events.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Sin eventos hoy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
