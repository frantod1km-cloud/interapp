import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import { addResidentAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ResidentsPage() {
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();

  const { data: residents } = await supabase
    .from("residents")
    .select("id, dni, first_name, last_name, unit, phone, active, created_at")
    .eq("organization_id", org.id)
    .order("last_name");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Residentes</h1>

      <form action={addResidentAction} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-5 gap-3">
        <input name="dni" placeholder="DNI" required className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <input name="first_name" placeholder="Nombre" required className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <input name="last_name" placeholder="Apellido" required className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <input name="unit" placeholder="Lote / Depto" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
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
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(residents ?? []).map((r) => (
              <tr key={r.id} className="border-t border-zinc-800">
                <td className="px-4 py-3 font-medium">{r.last_name}, {r.first_name}</td>
                <td className="px-4 py-3 tabular-nums">{formatDni(r.dni)}</td>
                <td className="px-4 py-3 text-zinc-400">{r.unit ?? "—"}</td>
                <td className="px-4 py-3">
                  {r.active ? (
                    <span className="text-emerald-400">Activo</span>
                  ) : (
                    <span className="text-zinc-500">Inactivo</span>
                  )}
                </td>
              </tr>
            ))}
            {(!residents || residents.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
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
