import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { getOrgUnitLevels } from "@/lib/units";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveUnitLevelsAction } from "../../unidades/actions";
import LevelsEditor from "./LevelsEditor";

export const dynamic = "force-dynamic";

const PRESETS: Array<{ id: string; name: string; emoji: string; levels: string[] }> = [
  { id: "country_simple", name: "Country chico", emoji: "🏞️", levels: ["Manzana", "Lote"] },
  { id: "country_grande", name: "Country grande", emoji: "🌳", levels: ["Sector", "Etapa", "Lote"] },
  { id: "edificio", name: "Edificio", emoji: "🏢", levels: ["Torre", "Piso", "Depto"] },
  { id: "industrial", name: "Parque industrial", emoji: "🏭", levels: ["Sector", "Galpón"] },
  { id: "plano", name: "Sin jerarquía (lista plana)", emoji: "📋", levels: ["Unidad"] },
];

export default async function SetupUnidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
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

      {currentLevels.length > 0 && (
        <div className="bg-emerald-600/15 border border-emerald-600/40 rounded-2xl p-4 mb-6 text-sm">
          <strong>Niveles actuales:</strong>{" "}
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

      {!hasUnits && currentLevels.length === 0 && (
        <>
          <h2 className="text-lg font-semibold mb-3">Elegí un preset</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {PRESETS.map((p) => (
              <form key={p.id} action={saveUnitLevelsAction}>
                {p.levels.map((l) => (
                  <input key={l} type="hidden" name="levels" value={l} />
                ))}
                <button
                  type="submit"
                  className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-emerald-600 hover:bg-zinc-900/80 transition"
                >
                  <div className="text-3xl mb-1">{p.emoji}</div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-zinc-400 mt-1">
                    {p.levels.join(" → ")}
                  </div>
                </button>
              </form>
            ))}
          </div>

          <h2 className="text-lg font-semibold mb-3">O armá uno a medida</h2>
        </>
      )}

      {hasUnits && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 mb-6 text-sm">
          ⚠️ Ya cargaste {existingUnits} unidad(es). Podés cambiar los <em>nombres</em> de
          los niveles, pero no la <em>cantidad</em> de niveles. Si necesitás cambiar la
          estructura, eliminá todas las unidades primero.
        </div>
      )}

      <LevelsEditor
        initial={currentLevels.length > 0 ? currentLevels : ["Sector", "Etapa", "Lote"]}
        canChangeCount={!hasUnits}
      />
    </div>
  );
}
