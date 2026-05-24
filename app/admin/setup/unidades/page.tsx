import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { getOrgUnitLevels } from "@/lib/units";
import { createAdminClient } from "@/lib/supabase/admin";
import { resetAllUnitsAction, saveUnitLevelsAction } from "../../unidades/actions";
import LevelsEditor from "./LevelsEditor";
import ResetUnitsForm from "./ResetUnitsForm";

export const dynamic = "force-dynamic";

const PRESETS: Array<{ id: string; name: string; emoji: string; levels: string[] }> = [
  { id: "country_simple", name: "Country chico", emoji: "🏞️", levels: ["Manzana", "Lote"] },
  { id: "country_grande", name: "Country grande", emoji: "🌳", levels: ["Sector", "Etapa", "Lote"] },
  { id: "edificio", name: "Edificio", emoji: "🏢", levels: ["Torre", "Piso", "Depto"] },
  { id: "industrial", name: "Parque industrial", emoji: "🏭", levels: ["Sector", "Galpón"] },
  { id: "plano", name: "Sin jerarquía (lista plana)", emoji: "📋", levels: ["Unidad"] },
];

function sameLevels(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.toLowerCase() === b[i].toLowerCase());
}

export default async function SetupUnidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") redirect("/admin");

  const currentLevels = await getOrgUnitLevels(org.id);

  const admin = createAdminClient();
  const { count: existingUnits } = await admin
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);
  const hasUnits = (existingUnits ?? 0) > 0;

  const currentPresetId = PRESETS.find((p) => sameLevels(p.levels, currentLevels))?.id ?? null;

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/admin" className="text-xs text-zinc-400 hover:text-white">
        ← Volver al admin
      </Link>

      <h1 className="text-3xl font-bold mt-3 mb-2">Configurá tu jerarquía</h1>
      <p className="text-zinc-400 mb-6">
        Cada barrio se organiza distinto. Definí los <strong>niveles</strong> de tu
        organigrama, de mayor a menor. Después vas a cargar las unidades reales (los
        lotes, deptos o galpones) respetando esta estructura.
      </p>

      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}
      {sp.reset && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-4 mb-4 text-sm text-emerald-300">
          ✅ Árbol vacío. Elegí una nueva configuración.
        </div>
      )}

      {currentLevels.length > 0 && (
        <div className="bg-emerald-600/15 border border-emerald-600/40 rounded-2xl p-4 mb-6 text-sm">
          <strong>Configuración actual:</strong>{" "}
          {currentLevels.map((l, i) => (
            <span key={l}>
              <span className="font-mono bg-zinc-900 px-2 py-0.5 rounded">{l}</span>
              {i < currentLevels.length - 1 && " → "}
            </span>
          ))}
          <Link href="/admin/unidades" className="text-emerald-400 underline ml-3">
            Ir a cargar unidades →
          </Link>
        </div>
      )}

      {/* Aviso explícito de qué se puede cambiar según el estado */}
      {hasUnits ? (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 mb-6 text-sm">
          ⚠️ Ya cargaste <strong>{existingUnits}</strong> unidad(es). Podés{" "}
          <strong>renombrar</strong> los niveles, pero no cambiar la cantidad. Para
          cambiar la estructura, primero borrá todo el árbol (más abajo).
        </div>
      ) : (
        <div className="bg-sky-500/10 border border-sky-500/40 rounded-2xl p-4 mb-6 text-sm">
          💡 Todavía no tenés unidades cargadas, así que podés cambiar libremente la
          configuración: elegí otro preset o armá uno custom.
        </div>
      )}

      {/* PRESETS — siempre visibles, el actual marcado */}
      <h2 className="text-lg font-semibold mb-3">Presets</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {PRESETS.map((p) => {
          const isCurrent = currentPresetId === p.id;
          const disabled = hasUnits && !isCurrent;
          return (
            <form key={p.id} action={saveUnitLevelsAction}>
              {p.levels.map((l) => (
                <input key={l} type="hidden" name="levels" value={l} />
              ))}
              <button
                type="submit"
                disabled={disabled}
                className={`w-full text-left rounded-2xl p-4 transition border-2 ${
                  isCurrent
                    ? "border-emerald-500 bg-emerald-600/10"
                    : disabled
                      ? "border-zinc-800 bg-zinc-900 opacity-40 cursor-not-allowed"
                      : "border-zinc-800 bg-zinc-900 hover:border-emerald-600 hover:bg-zinc-900/80"
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="text-3xl">{p.emoji}</div>
                  {isCurrent && (
                    <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">
                      ACTUAL
                    </span>
                  )}
                </div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-zinc-400 mt-1">
                  {p.levels.join(" → ")}
                </div>
              </button>
            </form>
          );
        })}
      </div>

      {/* CUSTOM editor */}
      <h2 className="text-lg font-semibold mb-3">
        {currentLevels.length > 0 ? "Editar la configuración actual" : "O armá uno a medida"}
      </h2>
      <div className="mb-8">
        <LevelsEditor
          initial={currentLevels.length > 0 ? currentLevels : ["Sector", "Etapa", "Lote"]}
          canChangeCount={!hasUnits}
        />
      </div>

      {/* RESET TOTAL — solo cuando hay unidades */}
      {hasUnits && (
        <div className="bg-rose-950/30 border border-rose-900/50 rounded-2xl p-4">
          <h2 className="text-lg font-semibold mb-2 text-rose-300">⚠️ Reiniciar todo</h2>
          <p className="text-sm text-zinc-400 mb-3">
            Borra todas las unidades del barrio (los {existingUnits} nodos actuales).
            Los residentes que estaban asignados quedan como <em>sin unidad</em>, pero
            su texto legacy se preserva — vas a poder reasignarlos con el migrador una
            vez que cargues el árbol nuevo.
          </p>
          <ResetUnitsForm action={resetAllUnitsAction} totalUnits={existingUnits ?? 0} />
        </div>
      )}
    </div>
  );
}
