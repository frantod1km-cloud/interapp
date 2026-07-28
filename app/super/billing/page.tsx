import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function SuperBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("subscriptions")
    .select(
      "id, plan, status, current_period_end, mp_preapproval_id, created_at, updated_at, organization_id, organizations(name, slug)",
    );

  if (sp.status) query = query.eq("status", sp.status);
  query = query.order("updated_at", { ascending: false }).limit(200);

  const { data: subs } = await query;

  // Breakdown por estado y por plan para los KPIs de arriba
  const { data: allSubs } = await admin.from("subscriptions").select("status, plan");
  const byStatus = new Map<string, number>();
  const byPlan = new Map<string, { count: number; mrr: number }>();
  let totalMrr = 0;

  for (const s of allSubs ?? []) {
    byStatus.set(s.status, (byStatus.get(s.status) ?? 0) + 1);
    if (s.status === "active") {
      const p = PLANS[s.plan as PlanId];
      const price = p?.priceArs && p.priceArs > 0 ? p.priceArs : 0;
      const cur = byPlan.get(s.plan) ?? { count: 0, mrr: 0 };
      cur.count += 1;
      cur.mrr += price;
      byPlan.set(s.plan, cur);
      totalMrr += price;
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Suscripciones</h1>
      <p className="text-sm text-zinc-400 mb-4">
        Estado de todas las suscripciones de Mercado Pago
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MiniStat label="MRR total" value={`$${totalMrr.toLocaleString("es-AR")}`} />
        <MiniStat label="Activas" value={String(byStatus.get("active") ?? 0)} />
        <MiniStat
          label="Pago pendiente"
          value={String(byStatus.get("past_due") ?? 0)}
          warn={(byStatus.get("past_due") ?? 0) > 0}
        />
        <MiniStat label="Canceladas" value={String(byStatus.get("cancelled") ?? 0)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold uppercase text-zinc-300 mb-3">MRR por plan</h3>
          <div className="divide-y divide-zinc-800">
            {Array.from(byPlan.entries()).map(([planId, { count, mrr }]) => (
              <div key={planId} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">{PLANS[planId as PlanId]?.name ?? planId}</div>
                  <div className="text-xs text-zinc-500">{count} suscripciones</div>
                </div>
                <div className="font-bold text-emerald-400">
                  ${mrr.toLocaleString("es-AR")}
                </div>
              </div>
            ))}
            {byPlan.size === 0 && (
              <p className="py-4 text-sm text-zinc-500">Sin suscripciones activas.</p>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold uppercase text-zinc-300 mb-3">
            Filtrar por estado
          </h3>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "", label: "Todas" },
              { id: "active", label: "Activas" },
              { id: "past_due", label: "Pago pendiente" },
              { id: "cancelled", label: "Canceladas" },
              { id: "suspended", label: "Suspendidas" },
            ].map((t) => {
              const active = (sp.status ?? "") === t.id;
              return (
                <Link
                  key={t.id}
                  href={t.id ? `/super/billing?status=${t.id}` : "/super/billing"}
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    active
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-zinc-950 text-zinc-400 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Barrio</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Próximo cobro</th>
              <th className="px-4 py-3">MP</th>
              <th className="px-4 py-3">Última update</th>
            </tr>
          </thead>
          <tbody>
            {(subs ?? []).map((s) => {
              const org = Array.isArray(s.organizations) ? s.organizations[0] : s.organizations;
              return (
                <tr key={s.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3">
                    <Link
                      href={`/super/orgs/${s.organization_id}`}
                      className="font-medium hover:text-emerald-400"
                    >
                      {org?.name ?? "?"}
                    </Link>
                    <div className="text-xs text-zinc-500">{org?.slug}</div>
                  </td>
                  <td className="px-4 py-3">{PLANS[s.plan as PlanId]?.name ?? s.plan}</td>
                  <td className="px-4 py-3">
                    <SubStatusChip status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {s.current_period_end
                      ? new Date(s.current_period_end).toLocaleDateString("es-AR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-zinc-500 truncate max-w-[120px]">
                    {s.mp_preapproval_id ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {new Date(s.updated_at).toLocaleDateString("es-AR")}
                  </td>
                </tr>
              );
            })}
            {(!subs || subs.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  Sin suscripciones para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-4 border ${
        warn ? "border-amber-700/40 bg-amber-950/20" : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <div className="text-xs text-zinc-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function SubStatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-600/20 text-emerald-400",
    past_due: "bg-amber-600/20 text-amber-300",
    suspended: "bg-rose-700/20 text-rose-300",
    cancelled: "bg-zinc-700/40 text-zinc-400",
  };
  const cls = map[status] ?? "bg-zinc-700/40 text-zinc-400";
  return <span className={`text-xs px-2 py-1 rounded ${cls}`}>{status}</span>;
}
