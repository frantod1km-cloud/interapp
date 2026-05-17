import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [{ count: residentsCount }, { count: todayCount }, { count: activeAuths }] =
    await Promise.all([
      supabase
        .from("residents")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("active", true),
      supabase
        .from("access_events")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .gte("occurred_at", startOfDay.toISOString()),
      supabase
        .from("authorizations")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("revoked", false)
        .gte("valid_until", new Date().toISOString()),
    ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Ingresos hoy" value={todayCount ?? 0} />
        <Stat label="Residentes activos" value={residentsCount ?? 0} />
        <Stat label="Autorizaciones vigentes" value={activeAuths ?? 0} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
      <div className="text-zinc-400 text-sm mb-2">{label}</div>
      <div className="text-4xl font-bold">{value}</div>
    </div>
  );
}
