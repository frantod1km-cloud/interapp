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
        <span className="text-sm text-zinc-700">{orgs?.length ?? 0} totales</span>
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white text-zinc-700 text-left">
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
                <tr key={o.id} className="border-t border-zinc-200">
                  <td className="px-4 py-3 font-medium">{o.name}</td>
                  <td className="px-4 py-3 text-zinc-700">{o.slug}</td>
                  <td className="px-4 py-3">{plan?.name ?? o.plan}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
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
                        className="text-xs px-3 py-1 rounded bg-zinc-100 hover:bg-zinc-200"
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
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-700">
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
    active: "bg-emerald-600/20 text-emerald-700",
    past_due: "bg-amber-600/20 text-amber-700",
    suspended: "bg-rose-700/20 text-rose-700",
    archived: "bg-zinc-200/40 text-zinc-700",
  };
  const cls = map[status] ?? "bg-zinc-200/40 text-zinc-700";
  return <span className={`text-xs px-2 py-1 rounded ${cls}`}>{status}</span>;
}
