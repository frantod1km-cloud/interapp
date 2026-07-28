import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGlobalKpis, pct } from "@/lib/super-stats";
import { PLANS, type PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const admin = createAdminClient();
  const kpis = await getGlobalKpis();

  // Distribución de planes (orgs activas)
  const { data: orgsForPlans } = await admin
    .from("organizations")
    .select("plan, status");
  const planCounts = new Map<string, number>();
  for (const o of orgsForPlans ?? []) {
    if (o.status !== "active") continue;
    planCounts.set(o.plan, (planCounts.get(o.plan) ?? 0) + 1);
  }
  const totalOrgs = Array.from(planCounts.values()).reduce((a, b) => a + b, 0);

  // Ingresos por día últimos 30 días (chart SVG básico, sin libs)
  const days = 30;
  const startWindow = new Date();
  startWindow.setDate(startWindow.getDate() - days);
  startWindow.setHours(0, 0, 0, 0);
  const { data: recentEvents } = await admin
    .from("access_events")
    .select("occurred_at")
    .gte("occurred_at", startWindow.toISOString());

  const byDay = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(startWindow);
    d.setDate(startWindow.getDate() + i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const e of recentEvents ?? []) {
    const key = new Date(e.occurred_at).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const series = Array.from(byDay.entries()); // [date, count]
  const maxCount = Math.max(1, ...series.map(([, v]) => v));

  // Top 10 orgs por actividad este mes
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const { data: eventsForTop } = await admin
    .from("access_events")
    .select("organization_id")
    .gte("occurred_at", startOfMonth.toISOString());
  const activityByOrg = new Map<string, number>();
  for (const e of eventsForTop ?? []) {
    activityByOrg.set(e.organization_id, (activityByOrg.get(e.organization_id) ?? 0) + 1);
  }
  const topOrgIds = Array.from(activityByOrg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topOrgs: Array<{ id: string; name: string; slug: string; count: number }> = [];
  if (topOrgIds.length > 0) {
    const { data: orgsData } = await admin
      .from("organizations")
      .select("id, name, slug")
      .in(
        "id",
        topOrgIds.map(([id]) => id),
      );
    const nameMap = new Map((orgsData ?? []).map((o) => [o.id, o]));
    for (const [id, count] of topOrgIds) {
      const o = nameMap.get(id);
      if (o) topOrgs.push({ id, name: o.name, slug: o.slug, count });
    }
  }

  const mrrPct = pct(kpis.mrr, kpis.mrrPrevMonth);
  const eventsPct = pct(kpis.eventsThisMonth, kpis.eventsPrevMonth);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Métricas</h1>
        <p className="text-sm text-zinc-400">Visión completa del negocio</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BigStat
          label="MRR"
          value={`$${kpis.mrr.toLocaleString("es-AR")}`}
          delta={mrrPct}
          hint={`vs $${kpis.mrrPrevMonth.toLocaleString("es-AR")} mes anterior`}
        />
        <BigStat
          label="Ingresos este mes"
          value={kpis.eventsThisMonth.toLocaleString("es-AR")}
          delta={eventsPct}
          hint={`vs ${kpis.eventsPrevMonth.toLocaleString("es-AR")} mes anterior`}
        />
        <BigStat
          label="Residentes"
          value={kpis.residentsTotal.toLocaleString("es-AR")}
        />
        <BigStat
          label="Churn del mes"
          value={String(kpis.churnThisMonth)}
          tone={kpis.churnThisMonth > 0 ? "danger" : "neutral"}
        />
      </div>

      {/* Chart de ingresos últimos 30 días */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300 mb-3">
          Ingresos por día (últimos 30)
        </h2>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${series.length * 24} 120`}
            className="w-full min-w-[600px]"
            preserveAspectRatio="none"
            style={{ height: 160 }}
          >
            {series.map(([date, count], i) => {
              const h = (count / maxCount) * 100;
              const y = 110 - h;
              return (
                <g key={date}>
                  <rect
                    x={i * 24 + 4}
                    y={y}
                    width={16}
                    height={h}
                    fill="#10b981"
                    opacity={0.85}
                  />
                  <text
                    x={i * 24 + 12}
                    y={118}
                    fontSize={7}
                    textAnchor="middle"
                    fill="#71717a"
                  >
                    {i % 3 === 0 ? date.slice(5) : ""}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          Máximo día: {maxCount.toLocaleString("es-AR")} ingresos · Total 30 días:{" "}
          {series.reduce((s, [, v]) => s + v, 0).toLocaleString("es-AR")}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribución de planes */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300 mb-3">
            Distribución por plan (orgs activas)
          </h2>
          <div className="space-y-2">
            {Array.from(planCounts.entries()).map(([planId, count]) => {
              const plan = PLANS[planId as PlanId];
              const pct = totalOrgs > 0 ? Math.round((count / totalOrgs) * 100) : 0;
              return (
                <div key={planId}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{plan?.name ?? planId}</span>
                    <span className="text-zinc-400 text-xs">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-zinc-950 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {planCounts.size === 0 && (
              <p className="text-sm text-zinc-500">Sin orgs activas.</p>
            )}
          </div>
        </div>

        {/* Top orgs por actividad */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300 mb-3">
            Top 10 barrios por actividad (este mes)
          </h2>
          <div className="divide-y divide-zinc-800">
            {topOrgs.map((o, i) => (
              <Link
                key={o.id}
                href={`/super/orgs/${o.id}`}
                className="flex items-center justify-between py-2 hover:bg-zinc-950 -mx-3 px-3 rounded text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-zinc-500 text-xs w-4">#{i + 1}</span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{o.name}</div>
                    <div className="text-xs text-zinc-500">{o.slug}</div>
                  </div>
                </div>
                <div className="font-bold tabular-nums text-emerald-400 flex-shrink-0 ml-2">
                  {o.count.toLocaleString("es-AR")}
                </div>
              </Link>
            ))}
            {topOrgs.length === 0 && (
              <p className="py-4 text-sm text-zinc-500">Sin actividad este mes.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  delta,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  delta?: { delta: number; sign: 1 | 0 | -1 };
  hint?: string;
  tone?: "neutral" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-rose-700/40 bg-rose-950/20"
      : "border-zinc-800 bg-zinc-900";
  return (
    <div className={`rounded-2xl p-4 border ${toneClass}`}>
      <div className="text-xs text-zinc-400 uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      <div className="flex items-baseline justify-between mt-2">
        {hint && <div className="text-xs text-zinc-500">{hint}</div>}
        {delta && delta.sign !== 0 && (
          <div
            className={`text-xs font-semibold ${
              delta.sign > 0 ? "text-emerald-400" : "text-rose-300"
            }`}
          >
            {delta.sign > 0 ? "▲" : "▼"} {Math.abs(delta.delta)}%
          </div>
        )}
      </div>
    </div>
  );
}
