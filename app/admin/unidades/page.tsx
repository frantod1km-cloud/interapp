import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import {
  addUnitAction,
  bulkCreateUnitsAction,
  removeUnitAction,
  toggleUnitActiveAction,
  updateUnitAction,
} from "./actions";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  lote: "🏞️ Lote",
  casa: "🏠 Casa",
  depto: "🏢 Depto",
  local: "🏪 Local",
  oficina: "🏛️ Oficina",
  otro: "📋 Otro",
};

export default async function UnidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const admin = createAdminClient();

  let query = admin
    .from("units")
    .select("id, label, kind, notes, active, created_at")
    .eq("organization_id", org.id)
    .order("label");

  if (sp.q && sp.q.trim()) {
    const term = sp.q.trim();
    const safe = term.replace(/[%_]/g, (c) => `\\${c}`);
    query = query.ilike("label", `%${safe}%`);
  }

  const { data: units } = await query;

  // Conteo de residentes por unit_id (una sola query)
  const unitIds = (units ?? []).map((u) => u.id);
  const residentsByUnit = new Map<string, number>();
  if (unitIds.length > 0) {
    const { data } = await admin
      .from("residents")
      .select("unit_id")
      .eq("organization_id", org.id)
      .in("unit_id", unitIds);
    for (const r of data ?? []) {
      if (r.unit_id) {
        residentsByUnit.set(r.unit_id, (residentsByUnit.get(r.unit_id) ?? 0) + 1);
      }
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Unidades del barrio</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Listado maestro de lotes, casas, departamentos, locales y oficinas. Cuando cargás un
        residente o el guardia anota un visitante, elige una unidad de esta lista para que
        siempre quede normalizado el destino.
      </p>

      {sp.saved && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 rounded-2xl p-4 mb-4 text-sm">
          ✅ Cambios guardados.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 text-rose-300 rounded-2xl p-4 mb-4 text-sm">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Buscador */}
      <form method="get" className="flex gap-2 mb-4">
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar unidad por etiqueta…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm"
        />
        <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
          Buscar
        </button>
        {sp.q && (
          <Link href="/admin/unidades" className="text-sm text-zinc-400 hover:text-white self-center px-3">
            Limpiar
          </Link>
        )}
      </form>

      {/* Alta individual */}
      <details className="bg-zinc-900 border border-zinc-800 rounded-2xl mb-3 group">
        <summary className="cursor-pointer p-4 font-semibold flex items-center justify-between list-none">
          <span>+ Agregar unidad</span>
          <span className="text-emerald-400 text-xl transition-transform group-open:rotate-45">+</span>
        </summary>
        <form action={addUnitAction} className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-4 gap-3 border-t border-zinc-800">
          <select name="kind" defaultValue="lote" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800">
            {Object.entries(KIND_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <input
            name="label"
            required
            placeholder='Ej: "Lote 42"'
            className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
          />
          <input
            name="notes"
            placeholder="Notas (opcional)"
            className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
          />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded px-4 py-2"
          >
            Agregar
          </button>
        </form>
      </details>

      {/* Alta masiva */}
      <details className="bg-zinc-900 border border-zinc-800 rounded-2xl mb-6 group">
        <summary className="cursor-pointer p-4 font-semibold flex items-center justify-between list-none">
          <span>📋 Alta masiva (rango numérico)</span>
          <span className="text-emerald-400 text-xl transition-transform group-open:rotate-45">+</span>
        </summary>
        <form action={bulkCreateUnitsAction} className="p-4 pt-0 space-y-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-400">
            Crea de una vez varias unidades con etiquetas numeradas. Ejemplo: prefijo
            "Lote", desde 1, hasta 200 → crea "Lote 1", "Lote 2"… "Lote 200".
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <select name="kind" defaultValue="lote" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800">
              {Object.entries(KIND_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
            <input
              name="prefix"
              required
              placeholder="Prefijo (Lote)"
              className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
            />
            <input
              type="number"
              name="from"
              required
              defaultValue="1"
              min="0"
              className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
            />
            <input
              type="number"
              name="to"
              required
              defaultValue="100"
              min="1"
              max="1000"
              className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded px-4 py-2"
            >
              Crear todas
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Las etiquetas que ya existan se ignoran. Máximo 1000 a la vez.
          </p>
        </form>
      </details>

      {/* Lista */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Etiqueta</th>
              <th className="px-4 py-3">Residentes</th>
              <th className="px-4 py-3">Notas</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(units ?? []).map((u) => (
              <tr key={u.id} className="border-t border-zinc-800 align-top">
                <td className="px-4 py-3 text-xs whitespace-nowrap">{KIND_LABELS[u.kind] ?? u.kind}</td>
                <td className="px-4 py-3 font-semibold">{u.label}</td>
                <td className="px-4 py-3 tabular-nums">{residentsByUnit.get(u.id) ?? 0}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs max-w-xs">{u.notes ?? "—"}</td>
                <td className="px-4 py-3">
                  {u.active ? (
                    <span className="text-emerald-400 text-xs">Activa</span>
                  ) : (
                    <span className="text-zinc-500 text-xs">Inactiva</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end flex-wrap">
                    <details>
                      <summary className="cursor-pointer text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 list-none">
                        Editar
                      </summary>
                      <form action={updateUnitAction} className="absolute z-10 mt-2 bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-2 right-0 w-72">
                        <input type="hidden" name="unit_id" value={u.id} />
                        <select name="kind" defaultValue={u.kind} className="w-full bg-zinc-900 rounded px-3 py-2 border border-zinc-800 text-sm">
                          {Object.entries(KIND_LABELS).map(([id, label]) => (
                            <option key={id} value={id}>{label}</option>
                          ))}
                        </select>
                        <input
                          name="label"
                          defaultValue={u.label}
                          required
                          className="w-full bg-zinc-900 rounded px-3 py-2 border border-zinc-800 text-sm"
                        />
                        <input
                          name="notes"
                          defaultValue={u.notes ?? ""}
                          placeholder="Notas"
                          className="w-full bg-zinc-900 rounded px-3 py-2 border border-zinc-800 text-sm"
                        />
                        <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded px-3 py-1.5">
                          Guardar
                        </button>
                      </form>
                    </details>
                    <form action={toggleUnitActiveAction}>
                      <input type="hidden" name="unit_id" value={u.id} />
                      <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                      <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700">
                        {u.active ? "Desactivar" : "Reactivar"}
                      </button>
                    </form>
                    <form action={removeUnitAction}>
                      <input type="hidden" name="unit_id" value={u.id} />
                      <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-rose-700">
                        Eliminar
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {(!units || units.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  {sp.q ? "Sin resultados." : "Aún no cargaste unidades. Usá 'Alta masiva' para crear de un solo paso (ej. Lote 1 a Lote 200)."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
