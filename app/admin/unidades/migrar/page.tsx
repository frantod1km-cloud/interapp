import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { getOrgUnitLevels, getUnitLeaves } from "@/lib/units";
import { createAdminClient } from "@/lib/supabase/admin";
import MigratorTable from "./MigratorTable";

export const dynamic = "force-dynamic";

export default async function MigrarUnidadesPage() {
  const org = (await getCurrentOrg())!;
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") redirect("/admin");

  const levels = await getOrgUnitLevels(org.id);
  if (levels.length === 0) redirect("/admin/setup/unidades");

  const admin = createAdminClient();

  // Buscamos residentes con `unit` text legacy pero sin unit_id
  const { data: legacyResidents } = await admin
    .from("residents")
    .select("id, dni, first_name, last_name, unit")
    .eq("organization_id", org.id)
    .is("unit_id", null)
    .not("unit", "is", null);

  // Agrupamos por el texto legacy: una sola decisión de mapeo afecta a todos
  // los residentes con el mismo texto.
  const grouped = new Map<
    string,
    { unit_text: string; residents: Array<{ id: string; name: string; dni: string }> }
  >();
  for (const r of legacyResidents ?? []) {
    if (!r.unit) continue;
    const key = r.unit;
    if (!grouped.has(key)) grouped.set(key, { unit_text: key, residents: [] });
    grouped.get(key)!.residents.push({
      id: r.id,
      name: `${r.last_name}, ${r.first_name}`,
      dni: r.dni,
    });
  }

  const leaves = await getUnitLeaves(org.id);

  // Sugerencia automática: si el texto legacy aparece como label de alguna
  // hoja, lo pre-seleccionamos.
  const groups = Array.from(grouped.values()).map((g) => {
    const t = g.unit_text.trim().toLowerCase();
    const suggested = leaves.find((l) =>
      l.label.toLowerCase() === t ||
      l.full_path.toLowerCase().includes(t),
    );
    return { ...g, suggestedLeafId: suggested?.id ?? null };
  });

  return (
    <div>
      <Link href="/admin/unidades" className="text-xs text-zinc-400 hover:text-white">
        ← Volver a unidades
      </Link>

      <h1 className="text-2xl font-bold mt-3 mb-2">Migrar residentes del padrón viejo</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Estos residentes tienen una unidad cargada como <strong>texto libre</strong> (del
        sistema anterior). Mapealos a una hoja del árbol nuevo. Una vez asignados, el
        guardia los va a poder reconocer correctamente.
      </p>

      {groups.length === 0 ? (
        <div className="bg-emerald-600/15 border border-emerald-600/40 rounded-2xl p-8 text-center">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-xl font-bold mb-2">No queda nada legacy.</h2>
          <p className="text-zinc-400">Todos los residentes están apuntando al árbol.</p>
        </div>
      ) : (
        <MigratorTable groups={groups} leaves={leaves} />
      )}
    </div>
  );
}
