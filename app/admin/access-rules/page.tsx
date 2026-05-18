import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { RESIDENT_KINDS } from "@/lib/resident-kinds";
import { describeRule, type AccessRule } from "@/lib/access/rules";
import WeekdayPicker from "@/components/WeekdayPicker";
import { upsertRuleAction, deleteRuleAction } from "./actions";

export const dynamic = "force-dynamic";

// Reglas globales SOLO para empleados del barrio (staff).
// Los demás kinds (owner/tenant/family/domestic/contractor) los gestiona
// cada residente desde /resident/people, porque cada propietario tiene su
// propia nómina.
const RULE_KIND_IDS = ["staff"] as const;

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
      <h1 className="text-2xl font-bold mb-2">Horario de empleados del barrio</h1>
      <p className="text-zinc-400 text-sm mb-2">
        Configurá horarios para los empleados de la <strong>administración</strong>: personal de
        limpieza pública, mantenimiento, jardinería de áreas comunes, etc. Todos los que estén
        marcados como categoría <strong>Empleado del barrio</strong>.
      </p>
      <p className="text-zinc-400 text-xs mb-6">
        Las personas que vienen a una casa específica (empleada doméstica, jardinero de un
        propietario, proveedor recurrente) las gestiona cada residente desde su propio panel.
        Cada uno define sus horarios.
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
        {RESIDENT_KINDS.filter((k) => (RULE_KIND_IDS as readonly string[]).includes(k.id)).map((k) => {
          const rule = rulesByKind.get(k.id);
          return (
            <div
              key={k.id}
              className={`bg-zinc-950 border rounded-2xl p-5 ${
                rule?.enabled ? "border-emerald-700/40" : "border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="font-bold text-lg">
                  {k.emoji} {k.label}
                </h3>
                {rule ? (
                  rule.enabled ? (
                    <span className="text-xs bg-emerald-600/20 text-emerald-400 px-2 py-1 rounded">
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

              <form action={upsertRuleAction} className="space-y-4">
                <input type="hidden" name="kind" value={k.id} />

                <div>
                  <label className="block text-xs text-zinc-400 mb-2">Días permitidos</label>
                  <WeekdayPicker name="weekday_mask" defaultValue={rule?.weekday_mask ?? 127} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
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
                  <div>
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
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked={rule?.enabled ?? true}
                        className="w-4 h-4"
                      />
                      Regla activa
                    </label>
                  </div>
                </div>

                <div className="flex gap-2">
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
