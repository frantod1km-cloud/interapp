import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;

export default async function SuperAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; org?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();
  const page = parseInt(sp.page ?? "1") || 1;

  let query = admin
    .from("audit_log")
    .select("id, action, entity_type, entity_id, metadata, created_at, organization_id, user_id");

  if (sp.action) query = query.eq("action", sp.action);
  if (sp.org) query = query.eq("organization_id", sp.org);

  const from = (page - 1) * PER_PAGE;
  query = query.order("created_at", { ascending: false }).range(from, from + PER_PAGE - 1);

  const { data: rows } = await query;

  // Enrichment: nombre del user y del org
  const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id).filter(Boolean) as string[]));
  const orgIds = Array.from(
    new Set((rows ?? []).map((r) => r.organization_id).filter(Boolean) as string[]),
  );

  const userEmails = new Map<string, string>();
  for (const uid of userIds) {
    const { data: u } = await admin.auth.admin.getUserById(uid);
    if (u?.user?.email) userEmails.set(uid, u.user.email);
  }

  const orgNames = new Map<string, { name: string; slug: string }>();
  if (orgIds.length > 0) {
    const { data: orgs } = await admin
      .from("organizations")
      .select("id, name, slug")
      .in("id", orgIds);
    for (const o of orgs ?? []) orgNames.set(o.id, { name: o.name, slug: o.slug });
  }

  // Lista de acciones distintas para el filtro
  const { data: allActions } = await admin
    .from("audit_log")
    .select("action")
    .limit(500);
  const uniqueActions = Array.from(new Set((allActions ?? []).map((a) => a.action))).sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Auditoría global</h1>
          <p className="text-sm text-zinc-400">
            Todas las acciones sensibles de la plataforma
          </p>
        </div>
      </div>

      <form method="get" className="flex flex-wrap gap-2 mb-4">
        <select
          name="action"
          defaultValue={sp.action ?? ""}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todas las acciones</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          name="org"
          defaultValue={sp.org ?? ""}
          placeholder="Org ID (opcional)"
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono"
        />
        <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
          Filtrar
        </button>
        {(sp.action || sp.org) && (
          <Link
            href="/super/audit"
            className="text-sm text-zinc-400 hover:text-white self-center px-3"
          >
            Limpiar
          </Link>
        )}
      </form>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-zinc-950 text-zinc-400 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Cuándo</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Barrio</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const org = r.organization_id ? orgNames.get(r.organization_id) : null;
              const email = r.user_id ? userEmails.get(r.user_id) : null;
              return (
                <tr key={r.id} className="border-t border-zinc-800 align-top">
                  <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono bg-zinc-950 px-2 py-0.5 rounded">
                      {r.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {org ? (
                      <Link
                        href={`/super/orgs/${r.organization_id}`}
                        className="text-sm hover:text-emerald-400"
                      >
                        {org.name}
                        <div className="text-xs text-zinc-500">{org.slug}</div>
                      </Link>
                    ) : (
                      <span className="text-xs text-zinc-500 italic">Global</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {email ?? <span className="text-zinc-500 italic">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400 max-w-md">
                    <code className="font-mono break-all">
                      {r.metadata ? JSON.stringify(r.metadata) : "—"}
                    </code>
                  </td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  Sin eventos con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-4">
        <a
          href={`/super/audit?page=${Math.max(1, page - 1)}${sp.action ? `&action=${sp.action}` : ""}${sp.org ? `&org=${sp.org}` : ""}`}
          className={`text-sm px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 ${
            page === 1 ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          ← Anterior
        </a>
        <a
          href={`/super/audit?page=${page + 1}${sp.action ? `&action=${sp.action}` : ""}${sp.org ? `&org=${sp.org}` : ""}`}
          className={`text-sm px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 ${
            (rows?.length ?? 0) < PER_PAGE ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          Siguiente →
        </a>
      </div>
    </div>
  );
}
