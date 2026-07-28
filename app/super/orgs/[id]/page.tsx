import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgStats } from "@/lib/super-stats";
import { PLANS, type PlanId } from "@/lib/plans";
import {
  changeOrgPlanAction,
  impersonateAdminAction,
  setOrgStatusAction,
  updateOrgAction,
} from "../../actions";
import ImpersonateLinkBox from "./ImpersonateLinkBox";

export const dynamic = "force-dynamic";

export default async function OrgDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; impersonate_link?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("organizations")
    .select("id, slug, name, plan, status, created_at, settings")
    .eq("id", id)
    .maybeSingle();

  if (!org) notFound();

  const stats = await getOrgStats(id);

  // Miembros con email
  const { data: members } = await admin
    .from("org_members")
    .select("user_id, role, created_at")
    .eq("organization_id", id)
    .order("created_at", { ascending: false });

  const memberEmails = new Map<string, string>();
  for (const m of members ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(m.user_id);
    if (u?.user?.email) memberEmails.set(m.user_id, u.user.email);
  }

  // Últimos 10 eventos
  const { data: recentEvents } = await admin
    .from("access_events")
    .select("id, dni, full_name, direction, result, occurred_at")
    .eq("organization_id", id)
    .order("occurred_at", { ascending: false })
    .limit(10);

  // Suscripción
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan, status, current_period_end, mp_preapproval_id")
    .eq("organization_id", id)
    .maybeSingle();

  // Audit reciente de esta org
  const { data: auditRows } = await admin
    .from("audit_log")
    .select("id, action, entity_type, metadata, created_at")
    .eq("organization_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const url = org.slug
    ? `https://${org.slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "bzseguridad.online"}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/super/orgs" className="text-xs text-zinc-400 hover:text-white">
          ← Volver a organizaciones
        </Link>
        <div className="flex items-center justify-between mt-2 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">{org.name}</h1>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-zinc-400 hover:text-emerald-400"
              >
                {url} ↗
              </a>
            )}
          </div>
          <StatusChip status={org.status} />
        </div>
      </div>

      {sp.saved && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-3 text-sm">
          ✅ Cambios guardados.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-3 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {sp.impersonate_link && (
        <ImpersonateLinkBox link={decodeURIComponent(sp.impersonate_link)} />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniStat label="Residentes" value={stats.residentsActive} />
        <MiniStat label="Guardias" value={stats.guards} />
        <MiniStat label="Admins" value={stats.admins} />
        <MiniStat label="Ingresos hoy" value={stats.eventsToday} />
        <MiniStat label="Ingresos mes" value={stats.eventsThisMonth} />
        <MiniStat
          label="Último ingreso"
          value={
            stats.lastEventAt
              ? new Date(stats.lastEventAt).toLocaleDateString("es-AR")
              : "Nunca"
          }
          small
        />
      </div>

      {/* Acciones críticas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editar */}
        <Card title="Datos del barrio">
          <form action={updateOrgAction} className="space-y-3">
            <input type="hidden" name="org_id" value={org.id} />
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nombre</label>
              <input
                name="name"
                defaultValue={org.name}
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Subdominio (¡ojo, cambia la URL!)
              </label>
              <input
                name="slug"
                defaultValue={org.slug}
                required
                pattern="[a-z0-9-]{3,40}"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Plan</label>
              <select
                name="plan"
                defaultValue={org.plan}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
              >
                {Object.entries(PLANS).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.name} — ${p.priceArs?.toLocaleString("es-AR") ?? "0"}/mes
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm"
            >
              Guardar cambios
            </button>
          </form>
        </Card>

        {/* Estado y acciones */}
        <Card title="Estado y acciones">
          <div className="space-y-3">
            {org.status !== "suspended" ? (
              <form action={setOrgStatusAction}>
                <input type="hidden" name="org_id" value={org.id} />
                <input type="hidden" name="status" value="suspended" />
                <button className="w-full bg-amber-700/30 hover:bg-amber-600/60 border border-amber-700/50 text-amber-200 font-semibold rounded px-4 py-2 text-sm">
                  ⏸️ Suspender barrio
                </button>
              </form>
            ) : (
              <form action={setOrgStatusAction}>
                <input type="hidden" name="org_id" value={org.id} />
                <input type="hidden" name="status" value="active" />
                <button className="w-full bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
                  ▶️ Reactivar barrio
                </button>
              </form>
            )}

            <form action={impersonateAdminAction}>
              <input type="hidden" name="org_id" value={org.id} />
              <button className="w-full bg-sky-700 hover:bg-sky-600 font-semibold rounded px-4 py-2 text-sm">
                🔑 Entrar como admin (impersonar)
              </button>
              <p className="text-[10px] text-zinc-500 mt-1">
                Genera un magic link temporal. Toda la acción queda en auditoría.
              </p>
            </form>

            {org.status !== "archived" && (
              <form action={setOrgStatusAction}>
                <input type="hidden" name="org_id" value={org.id} />
                <input type="hidden" name="status" value="archived" />
                <button
                  onClick={() => confirm("¿Archivar este barrio?")}
                  type="submit"
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded px-4 py-2 text-sm"
                >
                  🗄️ Archivar barrio
                </button>
              </form>
            )}
          </div>
        </Card>
      </div>

      {/* Miembros */}
      <Card title={`Miembros (${members?.length ?? 0})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="text-zinc-400 text-left text-xs uppercase">
              <tr>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Rol</th>
                <th className="py-2 pr-4">Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(members ?? []).map((m) => (
                <tr key={m.user_id}>
                  <td className="py-2 pr-4 text-zinc-300">
                    {memberEmails.get(m.user_id) ?? (
                      <span className="text-zinc-500 italic">sin email</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <RoleChip role={m.role} />
                  </td>
                  <td className="py-2 pr-4 text-xs text-zinc-400">
                    {new Date(m.created_at).toLocaleDateString("es-AR")}
                  </td>
                </tr>
              ))}
              {(!members || members.length === 0) && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-zinc-500">
                    Sin miembros cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Últimos ingresos + audit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Últimos ingresos">
          <div className="divide-y divide-zinc-800">
            {(recentEvents ?? []).map((e) => (
              <div key={e.id} className="py-2 text-sm flex items-center justify-between">
                <div>
                  <div className="font-medium">{e.full_name ?? e.dni}</div>
                  <div className="text-xs text-zinc-500">
                    {e.direction === "in" ? "↘ Entrada" : "↗ Salida"} · {e.result}
                  </div>
                </div>
                <div className="text-xs text-zinc-400">
                  {new Date(e.occurred_at).toLocaleString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
            {(!recentEvents || recentEvents.length === 0) && (
              <p className="py-4 text-sm text-zinc-500">Sin ingresos registrados.</p>
            )}
          </div>
        </Card>

        <Card title="Auditoría (últimas acciones)">
          <div className="divide-y divide-zinc-800">
            {(auditRows ?? []).map((a) => (
              <div key={a.id} className="py-2 text-sm">
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
              </div>
            ))}
            {(!auditRows || auditRows.length === 0) && (
              <p className="py-4 text-sm text-zinc-500">Sin acciones registradas.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Suscripción */}
      {sub && (
        <Card title="Suscripción">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Info label="Plan" value={PLANS[sub.plan as PlanId]?.name ?? sub.plan} />
            <Info label="Estado" value={sub.status} />
            <Info
              label="Próximo cobro"
              value={
                sub.current_period_end
                  ? new Date(sub.current_period_end).toLocaleDateString("es-AR")
                  : "—"
              }
            />
            <Info label="MP preapproval" value={sub.mp_preapproval_id ?? "—"} small />
          </div>
          {/* Quick plan change */}
          <form action={changeOrgPlanAction} className="flex items-center gap-2 mt-4">
            <input type="hidden" name="org_id" value={org.id} />
            <select
              name="plan"
              defaultValue={sub.plan}
              className="bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm"
            >
              {Object.entries(PLANS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold rounded px-3 py-1.5">
              Cambiar plan
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UI atoms
// ---------------------------------------------------------------------------
function MiniStat({
  label,
  value,
  small,
}: {
  label: string;
  value: number | string;
  small?: boolean;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
      <div className="text-xs text-zinc-400 uppercase tracking-wide">{label}</div>
      <div className={small ? "text-base font-semibold mt-1" : "text-2xl font-bold mt-1"}>
        {value}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide text-zinc-300">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Info({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={small ? "text-xs font-mono truncate" : "font-semibold"}>{value}</div>
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
  return <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${cls}`}>{status}</span>;
}

function RoleChip({ role }: { role: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    org_admin: { label: "Admin", cls: "bg-violet-600/20 text-violet-300" },
    guard_lead: { label: "Jefe guardia", cls: "bg-sky-600/20 text-sky-300" },
    guard: { label: "Guardia", cls: "bg-sky-500/20 text-sky-200" },
    resident: { label: "Residente", cls: "bg-emerald-600/20 text-emerald-400" },
    viewer: { label: "Solo lectura", cls: "bg-zinc-700/40 text-zinc-400" },
  };
  const m = map[role] ?? { label: role, cls: "bg-zinc-700/40 text-zinc-400" };
  return <span className={`text-xs px-2 py-0.5 rounded ${m.cls}`}>{m.label}</span>;
}
