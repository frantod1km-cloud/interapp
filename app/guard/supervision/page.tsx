import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import { createGuardAction, removeGuardAction } from "@/app/admin/guards/actions";

export const dynamic = "force-dynamic";

// Pantalla del jefe de guardia. Pensada para que un guard_lead supervise
// a sus guardias sin necesidad de tener acceso al panel admin del barrio.
//
// Layout: completamente separado de /admin/* — vive bajo /guard.
// Acceso permitido: guard_lead u org_admin.

export default async function SupervisionPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const org = await getCurrentOrg();
  if (!org) redirect("/");

  const role = await getCurrentMemberRole(org.id);
  if (role !== "guard_lead" && role !== "org_admin") {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-zinc-950 text-white">
        <p>Esta sección es para jefes de guardia.</p>
      </main>
    );
  }

  const admin = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);

  const [guardsResp, todayEventsResp, forcedResp, lastActivityResp] = await Promise.all([
    admin
      .from("org_members")
      .select("id, user_id, created_at")
      .eq("organization_id", org.id)
      .in("role", ["guard", "guard_lead"])
      .order("created_at", { ascending: false }),
    admin
      .from("access_events")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .gte("occurred_at", startOfDay.toISOString()),
    admin
      .from("access_events")
      .select("id, dni, full_name, occurred_at, reason, guard_id, gate_label")
      .eq("organization_id", org.id)
      .eq("result", "forced")
      .gte("occurred_at", since24h.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(20),
    admin
      .from("access_events")
      .select("guard_id, occurred_at")
      .eq("organization_id", org.id)
      .gte("occurred_at", since24h.toISOString())
      .order("occurred_at", { ascending: false }),
  ]);

  // Última actividad por guardia (de cualquier turno reciente)
  const lastSeen = new Map<string, string>();
  for (const e of lastActivityResp.data ?? []) {
    if (!e.guard_id) continue;
    if (!lastSeen.has(e.guard_id)) lastSeen.set(e.guard_id, e.occurred_at);
  }

  // Email/nombre de cada guardia
  const guards: Array<{
    id: string;
    user_id: string;
    email: string;
    name: string;
    role: string;
    lastSeen?: string;
  }> = [];
  for (const m of guardsResp.data ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(m.user_id);
    if (!u?.user) continue;
    // Buscar el rol original (ya filtramos por guard|guard_lead arriba)
    const { data: full } = await admin
      .from("org_members")
      .select("role")
      .eq("id", m.id)
      .maybeSingle();
    guards.push({
      id: m.id,
      user_id: m.user_id,
      email: u.user.email ?? "—",
      name: (u.user.user_metadata as { full_name?: string } | null)?.full_name ?? "",
      role: full?.role ?? "guard",
      lastSeen: lastSeen.get(m.user_id),
    });
  }

  // Email del guardia que forzó cada ingreso (para mostrar)
  const guardEmails = new Map<string, string>();
  for (const f of forcedResp.data ?? []) {
    if (!f.guard_id || guardEmails.has(f.guard_id)) continue;
    const { data: u } = await admin.auth.admin.getUserById(f.guard_id);
    if (u?.user?.email) guardEmails.set(f.guard_id, u.user.email);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <header className="flex items-center justify-between mb-6 max-w-5xl mx-auto">
        <div>
          <Link href="/guard" className="text-sm text-zinc-400 hover:text-zinc-400">
            ← Volver al control
          </Link>
          <h1 className="text-2xl font-bold mt-1">Supervisión — {org.name}</h1>
        </div>
        <form action="/api/logout" method="post">
          <button className="text-sm text-zinc-400 hover:text-white">Salir</button>
        </form>
      </header>

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Stats rápidas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat label="Ingresos hoy" value={todayEventsResp.count ?? 0} />
          <Stat
            label="Forzados (24h)"
            value={forcedResp.data?.length ?? 0}
            highlight={(forcedResp.data?.length ?? 0) > 0 ? "amber" : null}
          />
          <Stat label="Guardias activos" value={guards.length} />
        </div>

        {/* Alta de guardias */}
        {sp.created && (
          <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-4 text-sm">
            ✅ Guardia creado.
          </div>
        )}
        {sp.error && (
          <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 text-sm text-rose-300">
            {decodeURIComponent(sp.error)}
          </div>
        )}

        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="font-bold mb-3">Crear nuevo guardia</h2>
          <form action={createGuardAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input name="full_name" placeholder="Nombre y apellido" required className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
            <input name="email" type="email" placeholder="Email" required className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
            <input name="password" type="text" placeholder="Contraseña (mín. 10)" required minLength={10} className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2">
              Crear
            </button>
          </form>
        </section>

        {/* Lista de guardias */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <header className="px-5 py-3 bg-zinc-950 font-bold">Mis guardias</header>
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400 text-left">
              <tr>
                <th className="px-5 py-2">Nombre</th>
                <th className="px-5 py-2">Email</th>
                <th className="px-5 py-2">Rol</th>
                <th className="px-5 py-2">Última actividad</th>
                <th className="px-5 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {guards.map((g) => (
                <tr key={g.id} className="border-t border-zinc-800">
                  <td className="px-5 py-3 font-medium">{g.name || "—"}</td>
                  <td className="px-5 py-3 text-zinc-400">{g.email}</td>
                  <td className="px-5 py-3">
                    {g.role === "guard_lead" ? (
                      <span className="text-amber-300 text-xs font-bold">JEFE</span>
                    ) : (
                      <span className="text-zinc-400 text-xs">guardia</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-zinc-400">
                    {g.lastSeen ? (
                      new Date(g.lastSeen).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {g.role === "guard" && (
                      <form action={removeGuardAction} className="inline">
                        <input type="hidden" name="member_id" value={g.id} />
                        <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-rose-700">
                          Dar de baja
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {guards.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-zinc-400">
                    Sin guardias todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Ingresos forzados últimas 24h */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <header className="px-5 py-3 bg-zinc-950 font-bold flex items-center gap-2">
            <span>⚠️ Ingresos forzados (últimas 24 horas)</span>
          </header>
          {(forcedResp.data ?? []).length === 0 ? (
            <p className="px-5 py-6 text-center text-zinc-400 text-sm">
              No hubo ingresos forzados.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-400 text-left">
                <tr>
                  <th className="px-5 py-2">Hora</th>
                  <th className="px-5 py-2">DNI</th>
                  <th className="px-5 py-2">Persona</th>
                  <th className="px-5 py-2">Garita</th>
                  <th className="px-5 py-2">Guardia</th>
                  <th className="px-5 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {forcedResp.data!.map((f) => (
                  <tr key={f.id} className="border-t border-zinc-800">
                    <td className="px-5 py-3 tabular-nums">
                      {new Date(f.occurred_at).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3 tabular-nums">{formatDni(f.dni)}</td>
                    <td className="px-5 py-3">{f.full_name ?? "—"}</td>
                    <td className="px-5 py-3 text-zinc-400">{f.gate_label ?? "—"}</td>
                    <td className="px-5 py-3 text-zinc-400">
                      {f.guard_id ? guardEmails.get(f.guard_id) ?? "—" : "—"}
                    </td>
                    <td className="px-5 py-3 text-zinc-400">{f.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "amber" | null;
}) {
  const cls = highlight === "amber" ? "border-amber-600/50 bg-amber-900/20" : "border-zinc-800 bg-zinc-900 border border-zinc-800";
  return (
    <div className={`rounded-2xl p-5 border ${cls}`}>
      <div className="text-zinc-400 text-xs mb-1">{label}</div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
