import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import { kindMeta } from "@/lib/resident-kinds";
import {
  updateProfileAction,
  addOwnVehicleAction,
  removeOwnVehicleAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ResidentProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; vehicle_added?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: resident } = await supabase
    .from("residents")
    .select("id, dni, first_name, last_name, unit, phone, kind, access_expires_at, created_at")
    .eq("organization_id", org.id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!resident) {
    return (
      <div>
        <p className="text-zinc-400 text-sm">
          No estás asociado como residente en este barrio. Pedile a la administración que te
          dé de alta.
        </p>
      </div>
    );
  }

  const km = kindMeta(resident.kind);

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, plate, make, model, color")
    .eq("resident_id", resident.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Mi perfil</h1>
        <p className="text-zinc-400 text-sm">
          Datos personales que ve la administración del barrio y el guardia.
        </p>
      </div>

      {sp.saved && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 rounded-2xl p-4 text-sm">
          ✅ Cambios guardados.
        </div>
      )}
      {sp.vehicle_added && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 rounded-2xl p-4 text-sm">
          ✅ Vehículo agregado.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 text-rose-300 rounded-2xl p-4 text-sm">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Tarjeta principal de datos */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="bg-zinc-950 border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`text-xs px-2 py-1 rounded border ${km.className}`}>
              {km.emoji} {km.label}
            </div>
            {resident.access_expires_at && (
              <div className="text-xs px-2 py-1 rounded bg-amber-600/20 border border-amber-600/40 text-amber-300">
                Acceso vence el{" "}
                {new Date(resident.access_expires_at).toLocaleDateString("es-AR")}
              </div>
            )}
          </div>
          <h2 className="text-xl font-bold mt-2">
            {resident.first_name} {resident.last_name}
          </h2>
          <p className="text-sm text-zinc-400">
            DNI {formatDni(resident.dni)}
            {resident.unit && <> · {resident.unit}</>}
          </p>
        </div>

        <form action={updateProfileAction} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ReadOnly label="DNI" value={formatDni(resident.dni)} />
            <ReadOnly label="Nombre y apellido" value={`${resident.first_name} ${resident.last_name}`} />
            <ReadOnly label="Unidad / Lote" value={resident.unit ?? "—"} />
            <ReadOnly label="Email de la cuenta" value={user!.email ?? "—"} />
          </div>

          <div>
            <label className="block text-sm mb-1 text-zinc-400">Teléfono</label>
            <input
              name="phone"
              defaultValue={resident.phone ?? ""}
              placeholder="11 1234-5678"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
            />
            <p className="text-xs text-zinc-500 mt-1">
              El guardia o admin puede llamarte si necesita confirmar algo.
            </p>
          </div>

          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-xl"
          >
            Guardar cambios
          </button>
          <p className="text-xs text-zinc-500">
            ¿Algún dato está mal (nombre, DNI, lote)? Pedile a la administración del barrio que
            lo corrija.
          </p>
        </form>
      </section>

      {/* Mis vehículos */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="bg-zinc-950 border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
          <h2 className="font-bold">🚗 Mis vehículos</h2>
          <span className="text-xs text-zinc-500">{vehicles?.length ?? 0}</span>
        </div>

        <div className="p-4">
          {(vehicles ?? []).length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-4">
              Todavía no cargaste vehículos.
            </p>
          )}
          {(vehicles ?? []).map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between gap-3 py-2 border-b border-zinc-100 last:border-0"
            >
              <div>
                <div className="font-mono font-bold text-lg">{v.plate}</div>
                <div className="text-xs text-zinc-400">
                  {[v.make, v.model, v.color].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <form action={removeOwnVehicleAction}>
                <input type="hidden" name="vehicle_id" value={v.id} />
                <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-rose-100 text-zinc-400 hover:text-rose-900">
                  Eliminar
                </button>
              </form>
            </div>
          ))}
        </div>

        <form
          action={addOwnVehicleAction}
          className="p-4 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-5 gap-2"
        >
          <input
            name="plate"
            placeholder="Patente"
            required
            className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 uppercase"
            style={{ textTransform: "uppercase" }}
          />
          <input name="make" placeholder="Marca" className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2" />
          <input name="model" placeholder="Modelo" className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2" />
          <input name="color" placeholder="Color" className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2" />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded px-4 py-2"
          >
            Agregar
          </button>
        </form>
      </section>

      {/* Seguridad */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h2 className="font-bold mb-3">Seguridad</h2>
        <Link
          href="/resident/profile/password"
          className="text-emerald-400 hover:text-emerald-300 text-sm underline"
        >
          Cambiar contraseña →
        </Link>
      </section>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-white">
        {value}
      </div>
    </div>
  );
}
