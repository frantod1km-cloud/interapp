import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { addVehicleAction, removeVehicleAction } from "./actions";
import VehicleResidentPicker from "./VehicleResidentPicker";

export const dynamic = "force-dynamic";

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const admin = createAdminClient();

  let vehiclesQuery = admin
    .from("vehicles")
    .select("id, plate, make, model, color, resident_id, created_at, residents(first_name, last_name, unit, dni)")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (sp.q && sp.q.trim()) {
    const term = sp.q.trim();
    const safe = term.replace(/[%_]/g, (c) => `\\${c}`).toUpperCase();
    // Buscar por patente, marca, modelo o color
    vehiclesQuery = vehiclesQuery.or(
      `plate.ilike.%${safe}%,make.ilike.%${term.replace(/[%_]/g, (c) => `\\${c}`)}%,model.ilike.%${term.replace(/[%_]/g, (c) => `\\${c}`)}%,color.ilike.%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`,
    );
  }

  const [vehiclesResp, residentsResp] = await Promise.all([
    vehiclesQuery,
    admin
      .from("residents")
      .select("id, first_name, last_name, unit, dni, kind")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("last_name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Vehículos</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Cargá las patentes asociadas a cada residente. El guardia ve los vehículos del residente
        cuando escanea un DNI.
      </p>

      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Buscador */}
      <form method="get" className="flex gap-2 mb-4">
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar por patente, marca, modelo o color…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm"
        />
        <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
          Buscar
        </button>
        {sp.q && (
          <Link href="/admin/vehicles" className="text-sm text-zinc-400 hover:text-white self-center px-3">
            Limpiar
          </Link>
        )}
      </form>

      {/* Form de alta — el picker de residente es un combobox con buscador */}
      <form
        action={addVehicleAction}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6 space-y-3"
      >
        <VehicleResidentPicker residents={residentsResp.data ?? []} />
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <input
            name="plate"
            placeholder="Patente (AA123BB)"
            required
            className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 uppercase"
            style={{ textTransform: "uppercase" }}
          />
          <input name="make" placeholder="Marca" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
          <input name="model" placeholder="Modelo" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
          <input name="color" placeholder="Color" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
          <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2">
            Agregar
          </button>
        </div>
      </form>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-3">Patente</th>
              <th className="px-4 py-3">Marca / Modelo</th>
              <th className="px-4 py-3">Color</th>
              <th className="px-4 py-3">Residente</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {(vehiclesResp.data ?? []).map((v) => {
              const r = Array.isArray(v.residents) ? v.residents[0] : v.residents;
              return (
                <tr key={v.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 font-mono font-semibold">{v.plate}</td>
                  <td className="px-4 py-3">
                    {[v.make, v.model].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{v.color ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r ? `${r.last_name}, ${r.first_name}` : "—"}
                    {r?.unit && <span className="text-zinc-400"> · {r.unit}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={removeVehicleAction} className="inline">
                      <input type="hidden" name="vehicle_id" value={v.id} />
                      <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-rose-700">
                        Eliminar
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(!vehiclesResp.data || vehiclesResp.data.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  {sp.q ? "Sin resultados para tu búsqueda." : "Aún no hay vehículos cargados."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
