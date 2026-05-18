import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const admin = createAdminClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [orgsResp, activeSubsResp, eventsMonthResp] = await Promise.all([
    admin.from("organizations").select("plan, status"),
    admin.from("subscriptions").select("plan, status").eq("status", "active"),
    admin
      .from("access_events")
      .select("*", { count: "exact", head: true })
      .gte("occurred_at", startOfMonth.toISOString()),
  ]);

  const orgs = orgsResp.data ?? [];
  const activeOrgs = orgs.filter((o) => o.status === "active").length;
  const activeSubs = activeSubsResp.data ?? [];

  const mrr = activeSubs.reduce((sum, s) => {
    const plan = PLANS[s.plan as PlanId];
    return sum + (plan?.priceArs > 0 ? plan.priceArs : 0);
  }, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Métricas</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="MRR (ARS)" value={`$${mrr.toLocaleString("es-AR")}`} />
        <Stat label="Organizaciones activas" value={String(activeOrgs)} />
        <Stat label="Ingresos del mes (todas las orgs)" value={String(eventsMonthResp.count ?? 0)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6">
      <div className="text-zinc-700 text-sm mb-2">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
