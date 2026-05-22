import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import {
  addEmployeeAction,
  updateEmployeeAction,
  toggleEmployeeActiveAction,
  removeEmployeeAction,
  addEmployeeVehicleAction,
  removeEmployeeVehicleAction,
} from "./actions";

export const dynamic = "force-dynamic";

// Empleados del barrio = residents con kind='staff'. Personal de la
// administración (mantenimiento, limpieza pública, jardinería, vigilancia,
// etc.). Cada uno tiene cargo, empresa, tipo de contrato y opcionalmente
// vehículos.

export default async function EmpleadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const admin = createAdminClient();

  let query = admin
    .from("residents")
    .select("id, dni, first_name, last_name, phone, active, job_title, employer, contract_type, access_expires_at")
    .eq("organization_id", org.id)
    .eq("kind", "staff")
    .order("last_name");

  if (sp.q && sp.q.trim()) {
    const term = sp.q.trim();
    const digits = term.replace(/\D/g, "");
    if (digits.length >= 3) {
      query = query.ilike("dni", `%${digits}%`);
    } else {
      const safe = term.replace(/[%_]/g, (c) => `\\${c}`);
      query = query.or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,job_title.ilike.%${safe}%,employer.ilike.%${safe}%`,
      );
    }
  }

  const { data: employees } = await query;

  // Vehículos por empleado (una sola query)
  const employeeIds = (employees ?? []).map((e) => e.id);
  type VehRow = {
    id: string;
    plate: string;
    make: string | null;
    model: string | null;
    color: string | null;
    resident_id: string;
  };
  let allVehicles: VehRow[] = [];
  if (employeeIds.length > 0) {
    const { data } = await admin
      .from("vehicles")
      .select("id, plate, make, model, color, resident_id")
      .in("resident_id", employeeIds);
    allVehicles = (data ?? []) as VehRow[];
  }
  const vehiclesByEmployee = new Map<string, VehRow[]>();
  for (const v of allVehicles) {
    if (!vehiclesByEmployee.has(v.resident_id)) vehiclesByEmployee.set(v.resident_id, []);
    vehiclesByEmployee.get(v.resident_id)!.push(v);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">🛠️ Empleados del barrio</h1>
      </div>
      <p className="text-zinc-400 text-sm mb-6">
        Personal de la administración: mantenimiento, jardinería de áreas comunes, limpieza
        pública, vigilancia, etc. <strong>NO</strong> incluye empleados de los propietarios
        (esos los carga cada residente desde su propio panel).
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
          placeholder="Buscar por nombre, DNI, cargo o empresa…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm"
        />
        <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
          Buscar
        </button>
        {sp.q && (
          <Link href="/admin/empleados" className="text-sm text-zinc-400 hover:text-white self-center px-3">
            Limpiar
          </Link>
        )}
      </form>

      {/* Form de alta */}
      <details className="bg-zinc-900 border border-zinc-800 rounded-2xl mb-6 group">
        <summary className="cursor-pointer p-4 font-semibold flex items-center justify-between list-none">
          <span>+ Agregar empleado del barrio</span>
          <span className="text-emerald-400 text-xl transition-transform group-open:rotate-45">+</span>
        </summary>
        <form action={addEmployeeAction} className="p-4 pt-0 space-y-3 border-t border-zinc-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">DNI</label>
              <input
                name="dni"
                required
                inputMode="numeric"
                className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Teléfono</label>
              <input name="phone" className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nombre</label>
              <input
                name="first_name"
                required
                className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Apellido</label>
              <input
                name="last_name"
                required
                className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Cargo</label>
              <input
                name="job_title"
                placeholder="Ej: Jardinero, Vigilancia diurna…"
                className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Empresa (opcional)</label>
              <input
                name="employer"
                placeholder='Ej: "Servicios SRL". Vacío si trabaja para el barrio.'
                className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
              />
            </div>
          </div>

          <ContractTypeFields />

          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded px-4 py-3"
          >
            Agregar empleado
          </button>
        </form>
      </details>

      {/* Lista */}
      <div className="space-y-3">
        {(employees ?? []).length === 0 && (
          <p className="text-zinc-500 text-sm text-center py-6">
            {sp.q ? "Sin resultados." : "Todavía no cargaste empleados del barrio."}
          </p>
        )}
        {(employees ?? []).map((e) => {
          const vehicles = vehiclesByEmployee.get(e.id) ?? [];
          return (
            <div
              key={e.id}
              className={`bg-zinc-900 border rounded-2xl p-4 ${e.active ? "border-zinc-800" : "border-zinc-900 opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {!e.active && (
                      <span className="text-xs bg-zinc-700/40 text-zinc-400 px-2 py-0.5 rounded">
                        Inactivo
                      </span>
                    )}
                    {e.contract_type === "temporary" && e.access_expires_at && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 border border-amber-600/40">
                        Contrato hasta {new Date(e.access_expires_at).toLocaleDateString("es-AR")}
                      </span>
                    )}
                    {e.contract_type === "permanent" && (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-600/40">
                        Planta permanente
                      </span>
                    )}
                  </div>
                  <div className="font-bold">{e.first_name} {e.last_name}</div>
                  <div className="text-sm text-zinc-400 tabular-nums">DNI {formatDni(e.dni)} {e.phone && `· ${e.phone}`}</div>
                  {e.job_title && (
                    <div className="text-sm text-zinc-300 mt-1">
                      <span className="text-zinc-500">Cargo:</span> {e.job_title}
                      {e.employer && (
                        <span> · <span className="text-zinc-500">Empresa:</span> {e.employer}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <form action={toggleEmployeeActiveAction}>
                    <input type="hidden" name="employee_id" value={e.id} />
                    <input type="hidden" name="active" value={e.active ? "false" : "true"} />
                    <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700">
                      {e.active ? "Desactivar" : "Reactivar"}
                    </button>
                  </form>
                  <form action={removeEmployeeAction}>
                    <input type="hidden" name="employee_id" value={e.id} />
                    <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-rose-700">
                      Eliminar
                    </button>
                  </form>
                </div>
              </div>

              {/* Edit inline (contrato/cargo/empresa) */}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-zinc-400 hover:text-white">
                  Editar datos del empleado
                </summary>
                <form action={updateEmployeeAction} className="mt-3 bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-3">
                  <input type="hidden" name="employee_id" value={e.id} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      name="job_title"
                      defaultValue={e.job_title ?? ""}
                      placeholder="Cargo"
                      className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
                    />
                    <input
                      name="employer"
                      defaultValue={e.employer ?? ""}
                      placeholder="Empresa"
                      className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
                    />
                    <input
                      name="phone"
                      defaultValue={e.phone ?? ""}
                      placeholder="Teléfono"
                      className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <ContractTypeFields
                    defaultType={(e.contract_type as "permanent" | "temporary" | null) ?? null}
                    defaultDate={e.access_expires_at}
                  />
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded px-4 py-2">
                    Guardar
                  </button>
                </form>
              </details>

              {/* Vehículos */}
              <div className="mt-3">
                <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                  🚗 Vehículos ({vehicles.length})
                </div>
                {vehicles.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {vehicles.map((v) => (
                      <div key={v.id} className="bg-zinc-950 rounded px-3 py-2 flex items-center justify-between text-sm">
                        <div>
                          <span className="font-mono font-bold">{v.plate}</span>
                          {(v.make || v.model || v.color) && (
                            <span className="text-zinc-500 ml-2">
                              {[v.make, v.model, v.color].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </div>
                        <form action={removeEmployeeVehicleAction}>
                          <input type="hidden" name="vehicle_id" value={v.id} />
                          <button className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-rose-700">
                            Quitar
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
                <form
                  action={addEmployeeVehicleAction}
                  className="grid grid-cols-2 sm:grid-cols-5 gap-2"
                >
                  <input type="hidden" name="employee_id" value={e.id} />
                  <input
                    name="plate"
                    placeholder="Patente"
                    required
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm font-mono uppercase"
                    style={{ textTransform: "uppercase" }}
                  />
                  <input name="make" placeholder="Marca" className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm" />
                  <input name="model" placeholder="Modelo" className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm" />
                  <input name="color" placeholder="Color" className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm" />
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded px-3 py-1.5">
                    Agregar
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContractTypeFields({
  defaultType,
  defaultDate,
}: {
  defaultType?: "permanent" | "temporary" | null;
  defaultDate?: string | null;
}) {
  const defaultDateStr = defaultDate
    ? new Date(defaultDate).toISOString().slice(0, 10)
    : "";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Tipo de contrato</label>
        <select
          name="contract_type"
          defaultValue={defaultType ?? "permanent"}
          className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
        >
          <option value="permanent">Planta permanente</option>
          <option value="temporary">Contrato temporal</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">
          Vence el (solo para temporal)
        </label>
        <input
          type="date"
          name="access_expires_at"
          defaultValue={defaultDateStr}
          className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800"
        />
      </div>
    </div>
  );
}
