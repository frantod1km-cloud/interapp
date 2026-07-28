import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

const STATUS_TABS: Array<{ id: string; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "active", label: "Activas" },
  { id: "past_due", label: "Pago pendiente" },
  { id: "suspended", label: "Suspendidas" },
  { id: "archived", label: "Archivadas" },
];

export default async function SuperOrgsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; plan?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("organizations")
    .select("id, slug, name, plan, status, created_at");

  if (sp.status && sp.status !== "all") {
    query = query.eq("status", sp.status);
  }
  if (sp.plan) {
    query = query.eq("plan", sp.plan);
  }
  if (sp.q && sp.q.trim()) {
    const term = sp.q.trim().replace(/[%_]/g, (c) => `\\${c}`);
    query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
  }

  const sort = sp.sort ?? "recent";
  if (sort === "name") {
    query = query.order("name");
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data: orgs } = await query.limit(200);

  // Enrichment en batch: residents count por org, último evento
  const ids = (orgs ?? []).map((o) => o.id);
  const residentsCounts = new Map<string, number>();
  const lastEvents = new Map<string, string>();

  if (ids.length > 0) {
    // Contamos residents activos por org en una sola query
    const { data: rs } = await admin
      .from("residents")
      .select("organization_id")
      .in("organization_id", ids)
      .eq("active", true);
    for (const r of rs ?? []) {
      residentsCounts.set(r.organization_id, (residentsCounts.get(r.organization_id) ?? 0) + 1);
    }

    // Último evento por org: nos traemos el más reciente y filtramos por primer match
    const { data: evs } = await admin
      .from("access_events")
      .select("organization_id, occurred_at")
      .in("organization_id", ids)
      .order("occurred_at", { ascending: false })
      .limit(1000);
    for (const e of evs ?? []) {
      if (!lastEvents.has(e.organization_id)) {
        lastEvents.set(e.organization_id, e.occurred_at);
      }
    }
  }

  const statusCounts = new Map<string, number>();
  const { data: allForCount } = await admin.from("organizations").select("status");
  for (const o of allForCount ?? []) {
    statusCounts.set(o.status, (statusCounts.get(o.status) ?? 0) + 1);
  }
  statusCounts.set("all", allForCount?.length ?? 0);

  const currentStatus = sp.status ?? "all";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Organizaciones</h1>
          <p className="text-sm text-zinc-400">
            {orgs?.length ?? 0} en pantalla · {statusCounts.get("all") ?? 0} totales
          </p>
        </div>
        <Link
          href="/super/orgs/new"
          className="bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm px-4 py-2 rounded-lg"
        >
          + Crear barrio manual
        </Link>
      </div>

      {/* Buscador + orden */}
      <form method="get" className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar por nombre o subdominio…"
          className="flex-1 min-w-[220px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
        />
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <select
          name="sort"
          defaultValue={sort}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
        >
          <option value="recent">Más recientes</option>
          <option value="name">Por nombre</option>
        </select>
        <select
          name="plan"
          defaultValue={sp.plan ?? ""}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos los planes</option>
          {Object.entries(PLANS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
          Filtrar
        </button>
        {(sp.q || sp.plan) && (
          <Link
            href={sp.status && sp.status !== "all" ? `/super/orgs?status=${sp.status}` : "/super/orgs"}
            className="text-sm text-zinc-400 hover:text-white self-center px-3"
          >
            Limpiar
          </Link>
        )}
      </form>

      {/* Tabs de estado */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_TABS.map((t) => {
          const active = currentStatus === t.id;
          const count = statusCounts.get(t.id) ?? 0;
          const params = new URLSearchParams();
          if (t.id !== "all") params.set("status", t.id);
          if (sp.q) params.set("q", sp.q);
          if (sp.plan) params.set("plan", sp.plan);
          if (sort !== "recent") params.set("sort", sort);
          const href = `/super/orgs${params.toString() ? `?${params.toString()}` : ""}`;
          return (
            <Link
              key={t.id}
              href={href}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                active
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {t.label} ({count})
            </Link>
          );
        })}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-zinc-950 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-3">Barrio</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 tabular-nums">Residentes</th>
              <th className="px-4 py-3">Último ingreso</th>
              <th className="px-4 py-3">Creado</th>
            </tr>
          </thead>
          <tbody>
            {(orgs ?? []).map((o) => {
              const plan = PLANS[o.plan as PlanId];
              const lastEv = lastEvents.get(o.id);
              return (
                <tr key={o.id} className="border-t border-zinc-800 hover:bg-zinc-950">
                  <td className="px-4 py-3">
                    <Link href={`/super/orgs/${o.id}`} className="font-medium hover:text-emerald-400">
                      {o.name}
                    </Link>
                    <div className="text-xs text-zinc-500">{o.slug}</div>
                  </td>
                  <td className="px-4 py-3">{plan?.name ?? o.plan}</td>
                  <td className="px-4 py-3">
                    <StatusChip status={o.status} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{residentsCounts.get(o.id) ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {lastEv ? new Date(lastEv).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {new Date(o.created_at).toLocaleDateString("es-AR")}
                  </td>
                </tr>
              );
            })}
            {(!orgs || orgs.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  Sin resultados para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
