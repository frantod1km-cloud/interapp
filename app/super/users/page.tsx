import { createAdminClient } from "@/lib/supabase/admin";
import ResetPasswordButton from "./ResetPasswordButton";
import ToggleSuperButton from "./ToggleSuperButton";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function SuperUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; error?: string; saved?: string }>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();
  const page = parseInt(sp.page ?? "1") || 1;

  const { data: usersData } = await admin.auth.admin.listUsers({
    page,
    perPage: PER_PAGE,
  });

  const users = usersData?.users ?? [];

  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          u.email?.toLowerCase().includes(q) ||
          (u.user_metadata as { full_name?: string })?.full_name
            ?.toLowerCase()
            .includes(q),
      )
    : users;

  // Traer memberships de los users en pantalla en una sola query
  const uids = filtered.map((u) => u.id);
  const membershipMap = new Map<
    string,
    Array<{ organization_id: string; role: string; org_name: string; org_slug: string }>
  >();
  if (uids.length > 0) {
    const { data: mems } = await admin
      .from("org_members")
      .select("user_id, organization_id, role, organizations(name, slug)")
      .in("user_id", uids);
    for (const m of mems ?? []) {
      const arr = membershipMap.get(m.user_id) ?? [];
      const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
      arr.push({
        organization_id: m.organization_id,
        role: m.role,
        org_name: org?.name ?? "?",
        org_slug: org?.slug ?? "?",
      });
      membershipMap.set(m.user_id, arr);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-sm text-zinc-400">
            {filtered.length} en pantalla · página {page}
          </p>
        </div>
      </div>

      {sp.saved && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-3 mb-4 text-sm">
          ✅ Cambios guardados.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-3 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form method="get" className="flex gap-2 mb-4">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar por email o nombre…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
        />
        <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
          Buscar
        </button>
      </form>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-zinc-950 text-zinc-400 text-left text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Email / Nombre</th>
              <th className="px-4 py-3">Roles en orgs</th>
              <th className="px-4 py-3">Alta</th>
              <th className="px-4 py-3">Super</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const meta = (u.user_metadata as { full_name?: string; is_super?: boolean }) ?? {};
              const isSuper = meta.is_super === true;
              const memberships = membershipMap.get(u.id) ?? [];
              return (
                <tr key={u.id} className="border-t border-zinc-800 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.email}</div>
                    {meta.full_name && (
                      <div className="text-xs text-zinc-500">{meta.full_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {memberships.length === 0 ? (
                      <span className="text-xs text-zinc-500 italic">Sin orgs</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {memberships.map((m, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-zinc-400 font-mono">{m.org_slug}</span>{" "}
                            <RoleChip role={m.role} />
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {new Date(u.created_at).toLocaleDateString("es-AR")}
                  </td>
                  <td className="px-4 py-3">
                    {isSuper ? (
                      <span className="text-xs bg-violet-600/20 text-violet-300 px-2 py-1 rounded font-semibold">
                        SUPER
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end flex-wrap">
                      <ToggleSuperButton userId={u.id} isSuper={isSuper} email={u.email ?? ""} />
                      <ResetPasswordButton userId={u.id} email={u.email ?? ""} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  Sin usuarios en esta página.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-4">
        <a
          href={`/super/users?page=${Math.max(1, page - 1)}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
          className={`text-sm px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 ${
            page === 1 ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          ← Anterior
        </a>
        <a
          href={`/super/users?page=${page + 1}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
          className={`text-sm px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 ${
            users.length < PER_PAGE ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          Siguiente →
        </a>
      </div>
    </div>
  );
}

function RoleChip({ role }: { role: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    org_admin: { label: "admin", cls: "bg-violet-600/20 text-violet-300" },
    guard_lead: { label: "jefe guardia", cls: "bg-sky-600/20 text-sky-300" },
    guard: { label: "guardia", cls: "bg-sky-500/20 text-sky-200" },
    resident: { label: "residente", cls: "bg-emerald-600/20 text-emerald-400" },
    viewer: { label: "viewer", cls: "bg-zinc-700/40 text-zinc-400" },
  };
  const m = map[role] ?? { label: role, cls: "bg-zinc-700/40 text-zinc-400" };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.cls}`}>{m.label}</span>;
}
