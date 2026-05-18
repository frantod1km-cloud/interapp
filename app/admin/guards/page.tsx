import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { createGuardAction, removeGuardAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function GuardsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const admin = createAdminClient();

  const { data: members } = await admin
    .from("org_members")
    .select("id, user_id, role, created_at")
    .eq("organization_id", org.id)
    .in("role", ["guard", "guard_lead"])
    .order("role")
    .order("created_at", { ascending: false });

  const guards: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    created_at: string;
  }> = [];
  for (const m of members ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(m.user_id);
    if (u?.user) {
      guards.push({
        id: m.id,
        email: u.user.email ?? "—",
        name: (u.user.user_metadata as { full_name?: string } | null)?.full_name ?? "",
        role: m.role,
        created_at: m.created_at,
      });
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Guardias</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Acá creás las cuentas de guardias y jefes de guardia. El{" "}
        <strong>guardia</strong> solo opera el control de acceso. El{" "}
        <strong>jefe de guardia</strong> además puede crear/dar de baja otros guardias y ver
        reportes de ingresos forzados desde <code className="bg-zinc-900 border border-zinc-800 px-1 rounded">/guard/supervision</code>.
      </p>

      {sp.created && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-4 mb-4 text-sm">
          ✅ Cuenta creada. Pasale al guardia el email y la contraseña que cargaste.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form
        action={createGuardAction}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-5 gap-3"
      >
        <select name="role" defaultValue="guard" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800">
          <option value="guard">👮 Guardia</option>
          <option value="guard_lead">⭐ Jefe de guardia</option>
        </select>
        <input
          name="full_name"
          placeholder="Nombre y apellido"
          required
          className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
        />
        <input
          name="password"
          type="text"
          placeholder="Contraseña (mín. 8)"
          required
          minLength={8}
          className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
        />
        <button
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2"
        >
          Crear
        </button>
      </form>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Creado</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {guards.map((g) => (
              <tr key={g.id} className="border-t border-zinc-800">
                <td className="px-4 py-3">
                  {g.role === "guard_lead" ? (
                    <span className="text-amber-300 text-xs font-bold">⭐ JEFE</span>
                  ) : (
                    <span className="text-zinc-400 text-xs">👮 guardia</span>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{g.name || "—"}</td>
                <td className="px-4 py-3 text-zinc-400">{g.email}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {new Date(g.created_at).toLocaleDateString("es-AR")}
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={removeGuardAction} className="inline">
                    <input type="hidden" name="member_id" value={g.id} />
                    <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-rose-700">
                      Dar de baja
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {guards.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  Todavía no hay guardias cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
