import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import { kindMeta } from "@/lib/resident-kinds";
import { describeRule } from "@/lib/access/rules";
import {
  addPersonAction,
  removePersonAction,
  togglePersonActiveAction,
} from "./actions";
import RuleEditor from "./RuleEditor";
import ExpiryEditor from "./ExpiryEditor";
import PersonVehicles from "./PersonVehicles";

export const dynamic = "force-dynamic";

const RESIDENT_KIND_OPTIONS = ["domestic", "contractor"] as const;

type ExpiryStatus = {
  label: string;
  className: string;
};

function expiryStatus(expiresAt: string | null): ExpiryStatus | null {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  const now = Date.now();
  const days = Math.floor((d.getTime() - now) / (1000 * 60 * 60 * 24));
  if (days < 0) {
    return {
      label: `Vencido el ${d.toLocaleDateString("es-AR")}`,
      className: "bg-rose-700/20 text-rose-300 border border-rose-600/40",
    };
  }
  if (days <= 7) {
    return {
      label: `Vence en ${days === 0 ? "hoy" : `${days}d`} (${d.toLocaleDateString("es-AR")})`,
      className: "bg-amber-600/20 text-amber-300 border border-amber-600/40",
    };
  }
  return {
    label: `Vence ${d.toLocaleDateString("es-AR")}`,
    className: "bg-zinc-700/40 text-zinc-400",
  };
}

export default async function ResidentPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; added?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: me } = await supabase
    .from("residents")
    .select("id, first_name")
    .eq("organization_id", org.id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!me) {
    return (
      <div>
        <Link href="/resident" className="text-sm text-zinc-400 hover:text-zinc-400 inline-block mb-4">
          ← Volver
        </Link>
        <p className="text-zinc-400 text-sm">No estás asociado como residente.</p>
      </div>
    );
  }

  const { data: people } = await supabase
    .from("residents")
    .select("id, dni, first_name, last_name, kind, active, rule_enabled, weekday_mask, start_hour, end_hour, access_expires_at, created_at")
    .eq("organization_id", org.id)
    .eq("authorized_by_resident_id", me.id)
    .order("last_name");

  // Cargar vehículos de cada persona (todos en una query para evitar N+1)
  type VehicleRow = {
    id: string;
    plate: string;
    make: string | null;
    model: string | null;
    color: string | null;
    resident_id: string;
  };
  const personIds = (people ?? []).map((p) => p.id);
  let allVehicles: VehicleRow[] = [];
  if (personIds.length > 0) {
    const { data } = await supabase
      .from("vehicles")
      .select("id, plate, make, model, color, resident_id")
      .in("resident_id", personIds);
    allVehicles = (data ?? []) as VehicleRow[];
  }
  const vehiclesByPerson = new Map<string, VehicleRow[]>();
  for (const v of allVehicles) {
    if (!vehiclesByPerson.has(v.resident_id)) vehiclesByPerson.set(v.resident_id, []);
    vehiclesByPerson.get(v.resident_id)!.push(v);
  }

  return (
    <div>
      <Link href="/resident" className="text-sm text-zinc-400 hover:text-zinc-400 inline-block mb-4">
        ← Volver
      </Link>
      <h1 className="text-2xl font-bold mb-2">Empleados y visitas habituales</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Personas que vienen seguido a tu casa: empleada doméstica, jardinero, plomero recurrente,
        profe particular, etc. Podés definirles un <strong>horario habitual</strong> y una{" "}
        <strong>fecha de vencimiento</strong> (ej: la empleada hasta fin de junio, el albañil
        hasta que termine la obra).
      </p>

      {sp.added && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-4 mb-4 text-sm">
          ✅ Persona agregada con acceso permanente.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Form para agregar persona nueva */}
      <details className="bg-zinc-900 border border-zinc-800 rounded-2xl mb-6 group">
        <summary className="cursor-pointer p-4 font-semibold flex items-center justify-between list-none">
          <span>+ Agregar persona</span>
          <span className="text-emerald-400 text-xl transition-transform group-open:rotate-45">+</span>
        </summary>
        <form action={addPersonAction} className="p-4 pt-0 space-y-3 border-t border-zinc-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Categoría</label>
              <select name="kind" defaultValue="domestic" required className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800">
                {RESIDENT_KIND_OPTIONS.map((id) => {
                  const m = kindMeta(id);
                  return (
                    <option key={id} value={id}>{m.emoji} {m.label}</option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">DNI</label>
              <input name="dni" required inputMode="numeric" className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nombre</label>
              <input name="first_name" required className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Apellido</label>
              <input name="last_name" required className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">
                Fecha de vencimiento del acceso <span className="text-zinc-400">(opcional)</span>
              </label>
              <input
                type="date"
                name="access_expires_at"
                min={new Date().toISOString().slice(0, 10)}
                className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
              />
              <p className="text-xs text-zinc-400 mt-1">
                Dejá vacío si no tiene fecha de fin. Lo podés cambiar después.
              </p>
            </div>
          </div>
          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-3">
            Agregar persona
          </button>
        </form>
      </details>

      {/* Lista */}
      <div className="space-y-3">
        {(people ?? []).length === 0 && (
          <p className="text-zinc-400 text-sm text-center py-6">
            Todavía no agregaste a nadie. Tocá &quot;Agregar persona&quot; arriba.
          </p>
        )}
        {(people ?? []).map((p) => {
          const km = kindMeta(p.kind);
          const rule = p.rule_enabled
            ? {
                kind: p.kind,
                weekday_mask: p.weekday_mask,
                start_hour: p.start_hour,
                end_hour: p.end_hour,
                enabled: true,
              }
            : null;
          const exp = expiryStatus(p.access_expires_at);
          return (
            <div key={p.id} className={`bg-zinc-950 border rounded-2xl p-4 ${p.active ? "border-zinc-800" : "border-zinc-800 opacity-60"}`}>
              <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded border ${km.className}`}>
                      {km.emoji} {km.short}
                    </span>
                    {!p.active && (
                      <span className="text-xs bg-zinc-700/40 text-zinc-400 px-2 py-0.5 rounded">
                        Inactivo
                      </span>
                    )}
                    {exp && (
                      <span className={`text-xs px-2 py-0.5 rounded ${exp.className}`}>
                        {exp.label}
                      </span>
                    )}
                  </div>
                  <div className="font-bold">{p.first_name} {p.last_name}</div>
                  <div className="text-sm text-zinc-400 tabular-nums">DNI {formatDni(p.dni)}</div>
                  {rule ? (
                    <div className="text-xs text-emerald-400 mt-1">⏱️ {describeRule(rule)}</div>
                  ) : (
                    <div className="text-xs text-zinc-400 mt-1">Sin restricción horaria</div>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <form action={togglePersonActiveAction}>
                    <input type="hidden" name="person_id" value={p.id} />
                    <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                    <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700">
                      {p.active ? "Desactivar" : "Reactivar"}
                    </button>
                  </form>
                  <form action={removePersonAction}>
                    <input type="hidden" name="person_id" value={p.id} />
                    <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-rose-700">
                      Eliminar
                    </button>
                  </form>
                </div>
              </div>

              <div className="space-y-2">
                <RuleEditor
                  personId={p.id}
                  ruleEnabled={p.rule_enabled}
                  weekdayMask={p.weekday_mask}
                  startHour={p.start_hour}
                  endHour={p.end_hour}
                />
                <ExpiryEditor personId={p.id} currentExpiresAt={p.access_expires_at} />
                <PersonVehicles
                  personId={p.id}
                  vehicles={vehiclesByPerson.get(p.id) ?? []}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
