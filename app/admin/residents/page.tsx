import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import { addResidentAction, toggleResidentActiveAction } from "./actions";
import InviteButton from "./InviteButton";

export const dynamic = "force-dynamic";

export default async function ResidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const admin = createAdminClient();

  const { data: residents } = await admin
    .from("residents")
    .select("id, dni, first_name, last_name, unit, phone, active, user_id, created_at")
    .eq("organization_id", org.id)
    .order("last_name");

  // Para los que tienen user_id, traemos el email
  const emailsMap = new Map<string, string>();
  for (const r of residents ?? []) {
    if (r.user_id) {
      const { data: u } = await admin.auth.admin.getUserById(r.user_id);
      if (u?.user?.email) emailsMap.set(r.user_id, u.user.email);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Residentes</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Cargá las personas que viven en el barrio. Luego podés <strong>invitar</strong> a cada
        residente a tener su propia cuenta para que autorice visitas desde el celular.
      </p>

      {sp.invited && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-4 mb-4 text-sm">
          ✅ Cuenta creada. Pasale al residente el email y contraseña que cargaste.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form
        action={addResidentAction}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-6 gap-3"
      >
        <input name="dni" placeholder="DNI" required className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <input name="first_name" placeholder="Nombre" required className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <input name="last_name" placeholder="Apellido" required className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <input name="unit" placeholder="Lote / Depto" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <input name="phone" placeholder="Teléfono" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2">
          Agregar
        </button>
      </form>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-3">Apellido y Nombre</th>
              <th className="px-4 py-3">DNI</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(residents ?? []).map((r) => {
              const email = r.user_id ? emailsMap.get(r.user_id) : null;
              return (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 font-medium">{r.last_name}, {r.first_name}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDni(r.dni)}</td>
                  <td className="px-4 py-3 text-zinc-400">{r.unit ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {email ? (
                      <span className="text-emerald-400">{email}</span>
                    ) : (
                      <span className="text-zinc-600">Sin cuenta</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.active ? (
                      <span className="text-emerald-400">Activo</span>
                    ) : (
                      <span className="text-zinc-500">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      {!email && (
                        <InviteButton residentId={r.id} fullName={`${r.first_name} ${r.last_name}`} />
                      )}
                      <form action={toggleResidentActiveAction}>
                        <input type="hidden" name="resident_id" value={r.id} />
                        <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                        <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700">
                          {r.active ? "Desactivar" : "Reactivar"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(!residents || residents.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Aún no hay residentes cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
