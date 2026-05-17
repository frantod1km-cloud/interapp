import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { RESIDENT_KINDS } from "@/lib/resident-kinds";
import { describeRule, type AccessRule } from "@/lib/access/rules";
import { upsertRuleAction, deleteRuleAction } from "./actions";

export const dynamic = "force-dynamic";

const PRESETS = [
  { label: "Todos los días", mask: 127 },
  { label: "Lun a Vie", mask: 62 },     // 0b0111110
  { label: "Sáb y Dom", mask: 65 },     // 0b1000001
  { label: "Solo Lun, Mié, Vie", mask: 42 }, // 0b0101010
];

export default async function AccessRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const admin = createAdminClient();

  const { data: rules } = await admin
    .from("access_rules")
    .select("kind, weekday_mask, start_hour, end_hour, enabled")
    .eq("organization_id", org.id);

  const rulesByKind = new Map<string, AccessRule>();
  for (const r of rules ?? []) {
    rulesByKind.set(r.kind, r as AccessRule);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Reglas de acceso por categoría</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Configurá horarios para cada categoría de persona con acceso. Si alguien
        intenta entrar fuera de su ventana, el guardia ve una alerta amarilla y decide
        forzar el ingreso o rechazarlo.
        <br />
        <span className="text-zinc-500 text-xs">
          Las categorías sin regla configurada entran sin restricción (comportamiento por defecto).
        </span>
      </p>

      {sp.saved && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-4 mb-4 text-sm">
          ✅ Regla actualizada.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="grid gap-4">
        {RESIDENT_KINDS.map((k) => {
          const rule = rulesByKind.get(k.id);
          return (
            <div
              key={k.id}
              className={`bg-zinc-900 border rounded-2xl p-5 ${
                rule?.enabled ? "border-emerald-700/40" : "border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="font-bold text-lg">
                  {k.emoji} {k.label}
                </h3>
                {rule ? (
                  rule.enabled ? (
                    <span className="text-xs bg-emerald-600/20 text-emerald-300 px-2 py-1 rounded">
                      Activa · {describeRule(rule)}
                    </span>
                  ) : (
                    <span className="text-xs bg-zinc-700/40 text-zinc-400 px-2 py-1 rounded">
                      Sin restricción (deshabilitada)
                    </span>
                  )
                ) : (
                  <span className="text-xs bg-zinc-700/40 text-zinc-400 px-2 py-1 rounded">
                    Sin regla — acceso libre
                  </span>
                )}
              </div>

              <form action={upsertRuleAction} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <input type="hidden" name="kind" value={k.id} />

                <div className="sm:col-span-5">
                  <label className="block text-xs text-zinc-400 mb-1">Días permitidos</label>
                  <select
                    name="weekday_mask"
                    defaultValue={rule?.weekday_mask ?? 127}
                    className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
                  >
                    {PRESETS.map((p) => (
                      <option key={p.mask} value={p.mask}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs text-zinc-400 mb-1">Desde</label>
                  <select
                    name="start_hour"
                    defaultValue={rule?.start_hour ?? 0}
                    className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs text-zinc-400 mb-1">Hasta</label>
                  <select
                    name="end_hour"
                    defaultValue={rule?.end_hour ?? 23}
                    className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}:59
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-1 flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={rule?.enabled ?? true}
                      className="w-4 h-4"
                    />
                    Activa
                  </label>
                </div>

                <div className="sm:col-span-12 flex gap-2">
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
                    {rule ? "Actualizar regla" : "Guardar regla"}
                  </button>
                  {rule && (
                    <button
                      type="submit"
                      formAction={deleteRuleAction}
                      className="bg-zinc-800 hover:bg-rose-700 rounded px-4 py-2 text-sm"
                    >
                      Quitar regla
                    </button>
                  )}
                </div>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
