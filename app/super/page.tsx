import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGlobalKpis, pct } from "@/lib/super-stats";
import { PLANS, type PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function SuperDashboardPage() {
  const admin = createAdminClient();
  const kpis = await getGlobalKpis();

  // Últimas 5 orgs creadas
  const { data: recentOrgs } = await admin
    .from("organizations")
    .select("id, name, slug, plan, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  // Orgs con problemas (past_due o suspended)
  const { data: problemOrgs } = await admin
    .from("organizations")
    .select("id, name, slug, status")
    .in("status", ["past_due", "suspended"])
    .order("created_at", { ascending: false })
    .limit(10);

  // Últimos 5 audit events importantes
  const { data: recentAudit } = await admin
    .from("audit_log")
    .select("id, action, entity_type, metadata, created_at, organization_id")
    .in("action", [
      "org.create",
      "org.suspend",
      "org.impersonate",
      "super.grant",
      "super.revoke",
    ])
    .order("created_at", { ascending: false })
    .limit(6);

  const mrrPct = pct(kpis.mrr, kpis.mrrPrevMonth);
  const eventsPct = pct(kpis.eventsThisMonth, kpis.eventsPrevMonth);
  const orgsPct = pct(kpis.orgsCreatedThisMonth, kpis.orgsCreatedPrevMonth);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Panel general</h1>
        <p className="text-sm text-zinc-400">Estado global de la plataforma en tiempo real.</p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="MRR"
          value={`$${kpis.mrr.toLocaleString("es-AR")}`}
          delta={mrrPct}
          hint={`Mes anterior: $${kpis.mrrPrevMonth.toLocaleString("es-AR")}`}
        />
        <Kpi
          label="Orgs activas"
          value={String(kpis.orgsActive)}
          hint={`De ${kpis.orgsTotal} totales`}
        />
        <Kpi
          label="Ingresos hoy"
          value={String(kpis.eventsToday)}
          hint={`Este mes: ${kpis.eventsThisMonth.toLocaleString("es-AR")}`}
          delta={eventsPct}
        />
        <Kpi
          label="Residentes en plataforma"
          value={kpis.residentsTotal.toLocaleString("es-AR")}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Barrios este mes"
          value={String(kpis.orgsCreatedThisMonth)}
          delta={orgsPct}
          hint={`Mes anterior: ${kpis.orgsCreatedPrevMonth}`}
        />
        <Kpi
          label="Suscripciones activas"
          value={String(kpis.activeSubscriptions)}
        />
        <Kpi
          label="Pago pendiente"
          value={String(kpis.pastDueSubscriptions)}
          tone={kpis.pastDueSubscriptions > 0 ? "warning" : "neutral"}
        />
        <Kpi
          label="Churn este mes"
          value={String(kpis.churnThisMonth)}
          tone={kpis.churnThisMonth > 0 ? "danger" : "neutral"}
        />
      </div>

      {/* Alertas: orgs con problemas */}
      {problemOrgs && problemOrgs.length > 0 && (
        <Section title="⚠️ Barrios con problemas">
          <div className="divide-y divide-zinc-800">
            {problemOrgs.map((o) => (
              <Link
                key={o.id}
                href={`/super/orgs/${o.id}`}
                className="flex items-center justify-between py-3 hover:bg-zinc-950 px-3 -mx-3 rounded"
              >
                <div>
                  <div className="font-medium">{o.name}</div>
                  <div className="text-xs text-zinc-500">{o.slug}</div>
                </div>
                <StatusChip status={o.status} />
              </Link>
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Últimas orgs creadas */}
        <Section title="🆕 Últimos barrios creados">
          <div className="divide-y divide-zinc-800">
            {(recentOrgs ?? []).map((o) => (
              <Link
                key={o.id}
                href={`/super/orgs/${o.id}`}
                className="flex items-center justify-between py-3 hover:bg-zinc-950 px-3 -mx-3 rounded"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{o.name}</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {o.slug} · {PLANS[o.plan as PlanId]?.name ?? o.plan}
                  </div>
                </div>
                <div className="text-xs text-zinc-400 flex-shrink-0 ml-2">
                  {new Date(o.created_at).toLocaleDateString("es-AR")}
                </div>
              </Link>
            ))}
            {(!recentOrgs || recentOrgs.length === 0) && (
              <p className="py-4 text-sm text-zinc-500">Sin actividad.</p>
            )}
          </div>
          <Link
            href="/super/orgs"
            className="text-sm text-emerald-400 hover:underline mt-3 inline-block"
          >
            Ver todos →
          </Link>
        </Section>

        {/* Actividad del super admin reciente */}
        <Section title="📋 Actividad reciente (super)">
          <div className="divide-y divide-zinc-800">
            {(recentAudit ?? []).map((a) => (
              <div key={a.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs bg-zinc-950 px-2 py-0.5 rounded">
                    {a.action}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(a.created_at).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="text-xs text-zinc-400 mt-1 truncate">
                  {JSON.stringify(a.metadata).slice(0, 100)}
                </div>
              </div>
            ))}
            {(!recentAudit || recentAudit.length === 0) && (
              <p className="py-4 text-sm text-zinc-500">Sin actividad de super admin.</p>
            )}
          </div>
          <Link
            href="/super/audit"
            className="text-sm text-emerald-400 hover:underline mt-3 inline-block"
          >
            Ver auditoría completa →
          </Link>
        </Section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UI atoms
// ---------------------------------------------------------------------------
function Kpi({
  label,
  value,
  hint,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: { delta: number; sign: 1 | 0 | -1 };
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  const toneClass = {
    neutral: "border-zinc-800 bg-zinc-900",
    warning: "border-amber-700/40 bg-amber-950/20",
    danger: "border-rose-700/40 bg-rose-950/20",
    success: "border-emerald-700/40 bg-emerald-950/20",
  }[tone];
  return (
    <div className={`rounded-2xl p-4 border ${toneClass}`}>
      <div className="text-xs text-zinc-400 mb-1 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="flex items-baseline justify-between mt-1">
        {hint && <div className="text-xs text-zinc-500">{hint}</div>}
        {delta && delta.sign !== 0 && (
          <div
            className={`text-xs font-medium ${
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide text-zinc-300">
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-600/20 text-emerald-400",
    past_due: "bg-amber-600/20 text-amber-300",
    suspended: "bg-rose-700/20 text-rose-300",
    archived: "bg-zinc-700/40 text-zinc-400",
  };
  const cls = map[status] ?? "bg-zinc-700/40 text-zinc-400";
  return <span className={`text-xs px-2 py-1 rounded ${cls}`}>{status}</span>;
}
