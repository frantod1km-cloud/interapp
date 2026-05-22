import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import { kindMeta } from "@/lib/resident-kinds";

export const dynamic = "force-dynamic";

// Vista del admin para ver, por cada propietario/inquilino, las personas
// que él autorizó (empleadas, jardineros, proveedores) con sus vehículos.
// Útil para auditoría y soporte sin tener que pedirle al residente que
// abra su propio panel.

export default async function PersonalPorResidentePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; owner?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const admin = createAdminClient();

  // Lista de "propietarios candidatos": cualquier residente que NO sea
  // autorizado por otro y que NO sea staff (puede autorizar gente: owner,
  // tenant, family, other con cuenta).
  let ownersQuery = admin
    .from("residents")
    .select("id, dni, first_name, last_name, unit, kind")
    .eq("organization_id", org.id)
    .is("authorized_by_resident_id", null)
    .neq("kind", "staff")
    .order("last_name")
    .limit(50);

  if (sp.q && sp.q.trim()) {
    const term = sp.q.trim();
    const digits = term.replace(/\D/g, "");
    if (digits.length >= 3) {
      ownersQuery = ownersQuery.ilike("dni", `%${digits}%`);
    } else {
      const safe = term.replace(/[%_]/g, (c) => `\\${c}`);
      ownersQuery = ownersQuery.or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,unit.ilike.%${safe}%`,
      );
    }
  }

  const { data: owners } = await ownersQuery;

  // Si hay owner seleccionado, traer sus personas autorizadas + vehículos
  let selectedOwner: typeof owners extends infer T
    ? T extends Array<infer U>
      ? U | null
      : null
    : null = null;
  let people: Array<{
    id: string;
    dni: string;
    first_name: string;
    last_name: string;
    kind: string;
    active: boolean;
    phone: string | null;
    access_expires_at: string | null;
    rule_enabled: boolean;
    weekday_mask: number;
    start_hour: number;
    end_hour: number;
  }> = [];
  type VehRow = {
    id: string;
    plate: string;
    make: string | null;
    model: string | null;
    color: string | null;
    resident_id: string;
  };
  const vehiclesByPerson = new Map<string, VehRow[]>();

  if (sp.owner) {
    const { data: owner } = await admin
      .from("residents")
      .select("id, dni, first_name, last_name, unit, kind")
      .eq("id", sp.owner)
      .eq("organization_id", org.id)
      .maybeSingle();
    selectedOwner = owner ?? null;

    if (selectedOwner) {
      const { data: pp } = await admin
        .from("residents")
        .select("id, dni, first_name, last_name, kind, active, phone, access_expires_at, rule_enabled, weekday_mask, start_hour, end_hour")
        .eq("organization_id", org.id)
        .eq("authorized_by_resident_id", selectedOwner.id)
        .order("last_name");
      people = pp ?? [];

      const personIds = people.map((p) => p.id);
      if (personIds.length > 0) {
        const { data: vs } = await admin
          .from("vehicles")
          .select("id, plate, make, model, color, resident_id")
          .in("resident_id", personIds);
        for (const v of (vs ?? []) as VehRow[]) {
          if (!vehiclesByPerson.has(v.resident_id)) vehiclesByPerson.set(v.resident_id, []);
          vehiclesByPerson.get(v.resident_id)!.push(v);
        }
      }
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Personal por residente</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Buscá un propietario o inquilino y vas a ver todas las personas que él autorizó
        (empleadas, jardineros, proveedores) con sus datos y vehículos.
      </p>

      {/* Buscador de propietario */}
      <form method="get" className="flex gap-2 mb-4">
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar propietario/inquilino por nombre, DNI o lote…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm"
        />
        <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
          Buscar
        </button>
        {(sp.q || sp.owner) && (
          <Link
            href="/admin/personal-por-residente"
            className="text-sm text-zinc-400 hover:text-white self-center px-3"
          >
            Limpiar
          </Link>
        )}
      </form>

      {/* Resultados del buscador → lista de owners para elegir */}
      {!selectedOwner && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {(owners ?? []).length === 0 ? (
            <p className="p-8 text-center text-zinc-500 text-sm">
              {sp.q ? "Sin resultados." : "Tipeá algo en el buscador o tocá uno de la lista."}
            </p>
          ) : (
            (owners ?? []).map((o) => {
              const km = kindMeta(o.kind);
              return (
                <Link
                  key={o.id}
                  href={`/admin/personal-por-residente?owner=${o.id}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
                  className="block p-4 border-b border-zinc-800 last:border-0 hover:bg-zinc-800 transition"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-medium">
                        {km.emoji} {o.last_name}, {o.first_name}
                      </div>
                      <div className="text-xs text-zinc-400">
                        DNI {formatDni(o.dni)} {o.unit && `· ${o.unit}`}
                      </div>
                    </div>
                    <span className="text-emerald-400 text-sm">Ver personal →</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}

      {/* Detalle del owner seleccionado: personas autorizadas + vehículos */}
      {selectedOwner && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-emerald-700/40 rounded-2xl p-4 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Propietario</div>
              <div className="font-bold text-lg">
                {kindMeta(selectedOwner.kind).emoji} {selectedOwner.last_name},{" "}
                {selectedOwner.first_name}
              </div>
              <div className="text-sm text-zinc-400">
                DNI {formatDni(selectedOwner.dni)}{" "}
                {selectedOwner.unit && `· ${selectedOwner.unit}`}
              </div>
            </div>
            <Link
              href="/admin/personal-por-residente"
              className="text-sm text-zinc-400 hover:text-white"
            >
              ← Buscar otro
            </Link>
          </div>

          <h2 className="font-bold text-lg mt-6">
            Personal autorizado ({people.length})
          </h2>

          {people.length === 0 ? (
            <p className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500 text-sm">
              Este residente no autorizó a nadie todavía.
            </p>
          ) : (
            <div className="space-y-3">
              {people.map((p) => {
                const km = kindMeta(p.kind);
                const vehicles = vehiclesByPerson.get(p.id) ?? [];
                return (
                  <div
                    key={p.id}
                    className={`bg-zinc-900 border rounded-2xl p-4 ${p.active ? "border-zinc-800" : "border-zinc-900 opacity-60"}`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded border ${km.className}`}>
                            {km.emoji} {km.short}
                          </span>
                          {!p.active && (
                            <span className="text-xs bg-zinc-700/40 text-zinc-400 px-2 py-0.5 rounded">
                              Inactivo
                            </span>
                          )}
                          {p.access_expires_at && (
                            <span className="text-xs bg-amber-600/20 text-amber-300 border border-amber-600/40 px-2 py-0.5 rounded">
                              Vence {new Date(p.access_expires_at).toLocaleDateString("es-AR")}
                            </span>
                          )}
                        </div>
                        <div className="font-bold">
                          {p.first_name} {p.last_name}
                        </div>
                        <div className="text-sm text-zinc-400 tabular-nums">
                          DNI {formatDni(p.dni)} {p.phone && `· ${p.phone}`}
                        </div>
                        {p.rule_enabled && (
                          <div className="text-xs text-emerald-400 mt-1">
                            ⏱️ Horario habilitado
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Vehículos */}
                    {vehicles.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-zinc-800">
                        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                          🚗 Vehículos
                        </div>
                        <div className="space-y-1">
                          {vehicles.map((v) => (
                            <div key={v.id} className="text-sm">
                              <span className="font-mono font-bold">{v.plate}</span>
                              {(v.make || v.model || v.color) && (
                                <span className="text-zinc-500 ml-2">
                                  {[v.make, v.model, v.color].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
