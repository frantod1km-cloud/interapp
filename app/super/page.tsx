import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type PlanId } from "@/lib/plans";
import { setOrgStatusAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SuperOrgsPage() {
  const admin = createAdminClient();
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, slug, name, plan, status, created_at, subscriptions(status, current_period_end)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Organizaciones</h1>
        <span className="text-sm text-zinc-400">{orgs?.length ?? 0} totales</span>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-3">Barrio</th>
              <th className="px-4 py-3">Subdominio</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Creado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(orgs ?? []).map((o) => {
              const plan = PLANS[o.plan as PlanId];
              return (
                <tr key={o.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 font-medium">{o.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{o.slug}</td>
                  <td className="px-4 py-3">{plan?.name ?? o.plan}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {new Date(o.created_at).toLocaleDateString("es-AR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={setOrgStatusAction} className="inline">
                      <input type="hidden" name="org_id" value={o.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={o.status === "suspended" ? "active" : "suspended"}
                      />
                      <button
                        type="submit"
                        className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
                      >
                        {o.status === "suspended" ? "Reactivar" : "Suspender"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(!orgs || orgs.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Sin organizaciones aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-600/20 text-emerald-400",
    past_due: "bg-amber-600/20 text-amber-400",
    suspended: "bg-rose-700/20 text-rose-400",
    archived: "bg-zinc-700/40 text-zinc-400",
  };
  const cls = map[status] ?? "bg-zinc-700/40 text-zinc-400";
  return <span className={`text-xs px-2 py-1 rounded ${cls}`}>{status}</span>;
}
