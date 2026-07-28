import { createAdminClient } from "@/lib/supabase/admin";

// Métricas por-organización que usa el super admin en la lista y en el
// detalle. Se calculan on-the-fly (para 10-1000 orgs es aceptable). Si el
// número crece mucho, materializamos con una view.

export type OrgStats = {
  residentsActive: number;
  guards: number;
  admins: number;
  eventsThisMonth: number;
  eventsToday: number;
  lastEventAt: string | null;
};

export async function getOrgStats(orgId: string): Promise<OrgStats> {
  const admin = createAdminClient();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [rs, mem, evMonth, evToday, lastEv] = await Promise.all([
    admin
      .from("residents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("active", true),
    admin
      .from("org_members")
      .select("role")
      .eq("organization_id", orgId),
    admin
      .from("access_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("occurred_at", startOfMonth.toISOString()),
    admin
      .from("access_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("occurred_at", startOfDay.toISOString()),
    admin
      .from("access_events")
      .select("occurred_at")
      .eq("organization_id", orgId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const members = mem.data ?? [];
  return {
    residentsActive: rs.count ?? 0,
    guards: members.filter((m) => m.role === "guard" || m.role === "guard_lead").length,
    admins: members.filter((m) => m.role === "org_admin").length,
    eventsThisMonth: evMonth.count ?? 0,
    eventsToday: evToday.count ?? 0,
    lastEventAt: lastEv.data?.occurred_at ?? null,
  };
}

// Dashboard-level KPIs (globales, todas las orgs)
export type GlobalKpis = {
  orgsTotal: number;
  orgsActive: number;
  orgsPastDue: number;
  orgsSuspended: number;
  orgsCreatedThisMonth: number;
  orgsCreatedPrevMonth: number;
  residentsTotal: number;
  eventsThisMonth: number;
  eventsPrevMonth: number;
  eventsToday: number;
  mrr: number;
  mrrPrevMonth: number;
  activeSubscriptions: number;
  pastDueSubscriptions: number;
  churnThisMonth: number;
};

export async function getGlobalKpis(): Promise<GlobalKpis> {
  const admin = createAdminClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { PLANS } = await import("@/lib/plans");
  type PlanId = keyof typeof PLANS;

  const [orgs, orgsPrev, residents, evMonth, evPrev, evToday, subs, cancelledThisMonth] =
    await Promise.all([
      admin.from("organizations").select("id, status, created_at, plan"),
      admin
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfPrevMonth.toISOString())
        .lte("created_at", endOfPrevMonth.toISOString()),
      admin
        .from("residents")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      admin
        .from("access_events")
        .select("id", { count: "exact", head: true })
        .gte("occurred_at", startOfMonth.toISOString()),
      admin
        .from("access_events")
        .select("id", { count: "exact", head: true })
        .gte("occurred_at", startOfPrevMonth.toISOString())
        .lte("occurred_at", endOfPrevMonth.toISOString()),
      admin
        .from("access_events")
        .select("id", { count: "exact", head: true })
        .gte("occurred_at", startOfDay.toISOString()),
      admin.from("subscriptions").select("plan, status, updated_at"),
      admin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "cancelled")
        .gte("updated_at", startOfMonth.toISOString()),
    ]);

  const orgList = orgs.data ?? [];
  const subList = subs.data ?? [];

  const mrr = subList
    .filter((s) => s.status === "active")
    .reduce((sum, s) => {
      const p = PLANS[s.plan as PlanId];
      return sum + (p?.priceArs && p.priceArs > 0 ? p.priceArs : 0);
    }, 0);

  // MRR del mes anterior: cuentan las suscripciones activas al cierre del
  // mes anterior. Aproximación: activas actualmente que existían antes del
  // fin del mes pasado.
  const mrrPrev = subList
    .filter((s) => s.status === "active" && new Date(s.updated_at) <= endOfPrevMonth)
    .reduce((sum, s) => {
      const p = PLANS[s.plan as PlanId];
      return sum + (p?.priceArs && p.priceArs > 0 ? p.priceArs : 0);
    }, 0);

  return {
    orgsTotal: orgList.length,
    orgsActive: orgList.filter((o) => o.status === "active").length,
    orgsPastDue: orgList.filter((o) => o.status === "past_due").length,
    orgsSuspended: orgList.filter((o) => o.status === "suspended").length,
    orgsCreatedThisMonth: orgList.filter(
      (o) => new Date(o.created_at) >= startOfMonth,
    ).length,
    orgsCreatedPrevMonth: orgsPrev.count ?? 0,
    residentsTotal: residents.count ?? 0,
    eventsThisMonth: evMonth.count ?? 0,
    eventsPrevMonth: evPrev.count ?? 0,
    eventsToday: evToday.count ?? 0,
    mrr,
    mrrPrevMonth: mrrPrev,
    activeSubscriptions: subList.filter((s) => s.status === "active").length,
    pastDueSubscriptions: subList.filter((s) => s.status === "past_due").length,
    churnThisMonth: cancelledThisMonth.count ?? 0,
  };
}

export function pct(current: number, prev: number): { delta: number; sign: 1 | 0 | -1 } {
  if (prev === 0) return { delta: current === 0 ? 0 : 100, sign: current > 0 ? 1 : 0 };
  const delta = ((current - prev) / prev) * 100;
  return { delta: Math.round(delta), sign: delta > 0 ? 1 : delta < 0 ? -1 : 0 };
}
