import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";

export const dynamic = "force-dynamic";

// Reportes simples basados en los últimos 30 días. Sin librería de charts:
// barras CSS con div + ancho proporcional. Liviano y suficientemente claro.

type EventRow = {
  occurred_at: string;
  direction: "in" | "out";
  result: string;
  dni: string;
  full_name: string | null;
  authorization_id: string | null;
  resident_id: string | null;
  guard_id: string | null;
};

const DAYS_OF_WEEK = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default async function ReportsPage() {
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - 30);
  since.setHours(0, 0, 0, 0);

  const { data: eventsRaw } = await supabase
    .from("access_events")
    .select("occurred_at, direction, result, dni, full_name, authorization_id, resident_id, guard_id")
    .eq("organization_id", org.id)
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: false });

  const events: EventRow[] = eventsRaw ?? [];

  // 1) Conteo por hora del día (0..23)
  const byHour = new Array(24).fill(0);
  for (const e of events) byHour[new Date(e.occurred_at).getHours()]++;
  const maxHour = Math.max(1, ...byHour);

  // 2) Conteo por día de la semana
  const byDow = new Array(7).fill(0);
  for (const e of events) byDow[new Date(e.occurred_at).getDay()]++;
  const maxDow = Math.max(1, ...byDow);

  // 3) Conteo por resultado
  const byResult = events.reduce(
    (acc, e) => {
      acc[e.result] = (acc[e.result] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // 4) Top residentes con más visitas autorizadas que ingresaron
  const visitsByResident = new Map<string, number>();
  for (const e of events) {
    if (e.direction === "in" && e.resident_id && e.authorization_id) {
      visitsByResident.set(e.resident_id, (visitsByResident.get(e.resident_id) ?? 0) + 1);
    }
  }
  const topResidentIds = [...visitsByResident.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const residentDetails = new Map<string, { name: string; unit: string | null }>();
  if (topResidentIds.length > 0) {
    const { data: residents } = await supabase
      .from("residents")
      .select("id, first_name, last_name, unit")
      .in("id", topResidentIds.map(([id]) => id));
    for (const r of residents ?? []) {
      residentDetails.set(r.id, {
        name: `${r.last_name}, ${r.first_name}`,
        unit: r.unit,
      });
    }
  }
  const maxTopResident = Math.max(1, ...topResidentIds.map(([, c]) => c));

  // 5) Conteo por garita (si hay)
  const byGate: Record<string, number> = {};
  for (const e of events as Array<EventRow & { gate_label?: string | null }>) {
    const g = e.gate_label ?? null;
    if (!g) continue;
    byGate[g] = (byGate[g] ?? 0) + 1;
  }
  const gates = Object.entries(byGate).sort((a, b) => b[1] - a[1]);
  const maxGate = Math.max(1, ...gates.map(([, c]) => c));

  // 6) Tendencia 30 días: eventos por día
  const byDay = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, 0);
  }
  for (const e of events) {
    const key = new Date(e.occurred_at).toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, byDay.get(key)! + 1);
  }
  const dailySeries = [...byDay.entries()];
  const maxDaily = Math.max(1, ...dailySeries.map(([, c]) => c));

  // ============================================================================
  // Paquetería (últimos 30 días)
  // ============================================================================
  const { data: pkgs30 } = await supabase
    .from("packages")
    .select("courier, status, received_at, delivered_at, resident_id")
    .eq("organization_id", org.id)
    .gte("received_at", since.toISOString());

  const packages = pkgs30 ?? [];

  // Por estado
  const pkgByStatus: Record<string, number> = { pending: 0, delivered: 0, returned: 0 };
  for (const p of packages) pkgByStatus[p.status] = (pkgByStatus[p.status] ?? 0) + 1;

  // Por courier
  const pkgByCourier: Record<string, number> = {};
  for (const p of packages) {
    const c = p.courier ?? "(sin especificar)";
    pkgByCourier[c] = (pkgByCourier[c] ?? 0) + 1;
  }
  const couriersSorted = Object.entries(pkgByCourier).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCourier = Math.max(1, ...couriersSorted.map(([, c]) => c));

  // Top residentes
  const pkgByResident = new Map<string, number>();
  for (const p of packages) {
    if (!p.resident_id) continue;
    pkgByResident.set(p.resident_id, (pkgByResident.get(p.resident_id) ?? 0) + 1);
  }
  const topPkgResidentIds = [...pkgByResident.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const pkgResidentDetails = new Map<string, { name: string; unit: string | null }>();
  if (topPkgResidentIds.length > 0) {
    const { data: residents } = await supabase
      .from("residents")
      .select("id, first_name, last_name, unit")
      .in("id", topPkgResidentIds.map(([id]) => id));
    for (const r of residents ?? []) {
      pkgResidentDetails.set(r.id, {
        name: `${r.last_name}, ${r.first_name}`,
        unit: r.unit,
      });
    }
  }
  const maxTopPkgResident = Math.max(1, ...topPkgResidentIds.map(([, c]) => c));

  // Tiempo promedio en garita (delivered): horas
  let avgHours = 0;
  const delivered = packages.filter((p) => p.status === "delivered" && p.delivered_at);
  if (delivered.length > 0) {
    const total = delivered.reduce((sum, p) => {
      const ms = new Date(p.delivered_at!).getTime() - new Date(p.received_at).getTime();
      return sum + ms;
    }, 0);
    avgHours = total / delivered.length / (1000 * 60 * 60);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Reportes</h1>
        <p className="text-zinc-700 text-sm">
          Últimos 30 días · {events.length} eventos · {packages.length} paquetes
        </p>
      </div>

      <Card title="Eventos por día">
        <div className="flex items-end gap-0.5 h-32">
          {dailySeries.map(([date, count]) => (
            <div key={date} className="flex-1 flex flex-col items-center gap-1 group" title={`${date}: ${count}`}>
              <div
                className="w-full bg-emerald-700/30 hover:bg-emerald-500 transition rounded-t"
                style={{ height: `${(count / maxDaily) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="text-xs text-zinc-700 mt-2 flex justify-between">
          <span>{dailySeries[0]?.[0]}</span>
          <span>{dailySeries[dailySeries.length - 1]?.[0]}</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Por hora del día">
          <div className="flex items-end gap-1 h-32">
            {byHour.map((c, h) => (
              <div key={h} className="flex-1 flex flex-col items-center gap-1" title={`${h}:00 → ${c}`}>
                <div
                  className="w-full bg-sky-700/40 hover:bg-sky-500 transition rounded-t"
                  style={{ height: `${(c / maxHour) * 100}%` }}
                />
                <div className="text-[10px] text-zinc-700">{h}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Por día de la semana">
          <div className="space-y-2">
            {byDow.map((c, idx) => (
              <div key={idx} className="flex items-center gap-3 text-sm">
                <div className="w-12 text-zinc-700">{DAYS_OF_WEEK[idx]}</div>
                <div className="flex-1 bg-zinc-100 rounded h-5 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(c / maxDow) * 100}%` }}
                  />
                </div>
                <div className="w-10 text-right tabular-nums text-zinc-700">{c}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Por resultado">
          <div className="space-y-2">
            {Object.entries(byResult)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-zinc-700">{k}</span>
                  <span className="font-bold tabular-nums">{v}</span>
                </div>
              ))}
            {Object.keys(byResult).length === 0 && <p className="text-zinc-700 text-sm">Sin datos</p>}
          </div>
        </Card>

        {gates.length > 0 && (
          <Card title="Por garita">
            <div className="space-y-2">
              {gates.map(([name, c]) => (
                <div key={name} className="flex items-center gap-3 text-sm">
                  <div className="w-24 text-zinc-700 truncate">{name}</div>
                  <div className="flex-1 bg-zinc-100 rounded h-5 overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${(c / maxGate) * 100}%` }} />
                  </div>
                  <div className="w-10 text-right tabular-nums text-zinc-700">{c}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Card title="Top residentes con más visitas (30 días)">
        {topResidentIds.length === 0 ? (
          <p className="text-zinc-700 text-sm">Sin visitas autorizadas todavía.</p>
        ) : (
          <div className="space-y-2">
            {topResidentIds.map(([id, c]) => {
              const r = residentDetails.get(id);
              return (
                <div key={id} className="flex items-center gap-3 text-sm">
                  <div className="w-48 truncate">
                    {r?.name ?? "—"}
                    {r?.unit && <span className="text-zinc-700 text-xs"> · {r.unit}</span>}
                  </div>
                  <div className="flex-1 bg-zinc-100 rounded h-5 overflow-hidden">
                    <div
                      className="h-full bg-sky-500"
                      style={{ width: `${(c / maxTopResident) * 100}%` }}
                    />
                  </div>
                  <div className="w-10 text-right tabular-nums text-zinc-700">{c}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ===== Paquetería ===== */}
      <div className="pt-6 border-t border-zinc-200">
        <h2 className="text-xl font-bold mb-4">📦 Paquetería (30 días)</h2>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-sky-900/20 border border-sky-700/40 rounded-2xl p-5">
            <div className="text-zinc-700 text-xs mb-1">Pendientes ahora</div>
            <div className="text-3xl font-bold">{pkgByStatus.pending ?? 0}</div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-5">
            <div className="text-zinc-700 text-xs mb-1">Entregados</div>
            <div className="text-3xl font-bold text-emerald-700">{pkgByStatus.delivered ?? 0}</div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-5">
            <div className="text-zinc-700 text-xs mb-1">Devueltos</div>
            <div className="text-3xl font-bold text-amber-700">{pkgByStatus.returned ?? 0}</div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-5">
            <div className="text-zinc-700 text-xs mb-1">Promedio en garita</div>
            <div className="text-3xl font-bold">
              {avgHours > 0 ? formatHours(avgHours) : "—"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Top mensajerías">
            {couriersSorted.length === 0 ? (
              <p className="text-zinc-700 text-sm">Sin paquetes en este período.</p>
            ) : (
              <div className="space-y-2">
                {couriersSorted.map(([name, c]) => (
                  <div key={name} className="flex items-center gap-3 text-sm">
                    <div className="w-32 text-zinc-700 truncate">{name}</div>
                    <div className="flex-1 bg-zinc-100 rounded h-5 overflow-hidden">
                      <div
                        className="h-full bg-sky-500"
                        style={{ width: `${(c / maxCourier) * 100}%` }}
                      />
                    </div>
                    <div className="w-10 text-right tabular-nums text-zinc-700">{c}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Top residentes con más paquetes">
            {topPkgResidentIds.length === 0 ? (
              <p className="text-zinc-700 text-sm">Sin paquetes en este período.</p>
            ) : (
              <div className="space-y-2">
                {topPkgResidentIds.map(([id, c]) => {
                  const r = pkgResidentDetails.get(id);
                  return (
                    <div key={id} className="flex items-center gap-3 text-sm">
                      <div className="w-48 truncate">
                        {r?.name ?? "—"}
                        {r?.unit && <span className="text-zinc-700 text-xs"> · {r.unit}</span>}
                      </div>
                      <div className="flex-1 bg-zinc-100 rounded h-5 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${(c / maxTopPkgResident) * 100}%` }}
                        />
                      </div>
                      <div className="w-10 text-right tabular-nums text-zinc-700">{c}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} días`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6">
      <h2 className="font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}
