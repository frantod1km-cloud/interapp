import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { addGateAction, toggleGateAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function GatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const admin = createAdminClient();

  const { data: gates } = await admin
    .from("gates")
    .select("id, name, active, created_at")
    .eq("organization_id", org.id)
    .order("name");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Garitas</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Si el barrio tiene varias entradas, cargá cada garita acá. Cada tablet de guardia elige
        una vez en qué garita está, y todos los ingresos quedan identificados con esa etiqueta.
      </p>

      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form
        action={addGateAction}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6 flex gap-3 flex-wrap"
      >
        <input
          name="name"
          placeholder='Nombre de la garita (ej: "Principal", "Servicio")'
          required
          className="flex-1 min-w-[220px] bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
        />
        <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2">
          Agregar garita
        </button>
      </form>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {(gates ?? []).map((g) => (
              <tr key={g.id} className="border-t border-zinc-800">
                <td className="px-4 py-3 font-medium">{g.name}</td>
                <td className="px-4 py-3">
                  {g.active ? (
                    <span className="text-emerald-400">Activa</span>
                  ) : (
                    <span className="text-zinc-400">Inactiva</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleGateAction} className="inline">
                    <input type="hidden" name="gate_id" value={g.id} />
                    <input type="hidden" name="active" value={g.active ? "false" : "true"} />
                    <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700">
                      {g.active ? "Desactivar" : "Reactivar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!gates || gates.length === 0) && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-400">
                  Sin garitas. Si tu barrio tiene una sola entrada, podés saltarte esta sección.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
