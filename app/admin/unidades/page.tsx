import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { getOrgUnitLevels, getUnitTree, type TreeUnit } from "@/lib/units";
import { createAdminClient } from "@/lib/supabase/admin";
import UnitTreeView from "./UnitTreeView";

export const dynamic = "force-dynamic";

export default async function UnidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; created?: string; skipped?: string; error?: string; level_saved?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") redirect("/admin");

  const levels = await getOrgUnitLevels(org.id);

  // Si la org no configuró los niveles → wizard obligatorio
  if (levels.length === 0) {
    redirect("/admin/setup/unidades");
  }

  const tree = await getUnitTree(org.id);

  // Conteo de residentes con "unit text" legacy (sin unit_id) — los que
  // tienen un valor en `unit` pero no apuntan a la nueva tabla.
  const admin = createAdminClient();
  const { count: legacyCount } = await admin
    .from("residents")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .is("unit_id", null)
    .not("unit", "is", null);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Unidades del barrio</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/setup/unidades"
            className="bg-zinc-800 hover:bg-zinc-700 text-sm px-4 py-2 rounded-lg font-medium"
          >
            ⚙️ Niveles
          </Link>
          {(legacyCount ?? 0) > 0 && (
            <Link
              href="/admin/unidades/migrar"
              className="bg-amber-600 hover:bg-amber-500 text-sm px-4 py-2 rounded-lg font-medium"
            >
              🔄 Migrar {legacyCount} residente(s) legacy
            </Link>
          )}
        </div>
      </div>

      <p className="text-zinc-400 text-sm mb-4">
        Jerarquía:{" "}
        {levels.map((l, i) => (
          <span key={l}>
            <span className="font-mono bg-zinc-900 px-2 py-0.5 rounded text-xs">{l}</span>
            {i < levels.length - 1 && <span className="opacity-50"> → </span>}
          </span>
        ))}
      </p>

      {sp.saved && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 rounded-2xl p-4 mb-4 text-sm">
          ✅ Cambios guardados{sp.created && ` (${sp.created} unidades creadas)`}
          {sp.skipped === "all" && " — todas ya existían"}.
        </div>
      )}
      {sp.level_saved && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 rounded-2xl p-4 mb-4 text-sm">
          ✅ Niveles guardados. Ahora cargá las unidades reales.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 text-rose-300 rounded-2xl p-4 mb-4 text-sm">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <UnitTreeView tree={tree} levels={levels} />

      {tree.length === 0 && (
        <EmptyState rootLevelName={levels[0]} levels={levels} />
      )}
    </div>
  );
}

function EmptyState({ rootLevelName, levels }: { rootLevelName: string; levels: string[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
      <div className="text-5xl mb-3">🌳</div>
      <h2 className="text-xl font-bold mb-2">Empezá a cargar tu árbol</h2>
      <p className="text-zinc-400 text-sm mb-4 max-w-md mx-auto">
        Tu jerarquía es <strong>{levels.join(" → ")}</strong>. Primero cargá los nodos
        de nivel <strong>{rootLevelName}</strong>. Después podés meterte adentro de cada
        uno para cargar los siguientes niveles, o usar &quot;Alta masiva&quot; para crear
        muchos de una.
      </p>
      <p className="text-xs text-zinc-500">
        Usá los botones que aparecen debajo de cada nodo para agregar sus hijos.
      </p>
    </div>
  );
}
