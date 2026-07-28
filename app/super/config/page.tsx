import { createAdminClient } from "@/lib/supabase/admin";
import { saveGlobalConfigAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SuperConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: cfg } = await admin
    .from("platform_config")
    .select("*")
    .eq("id", "singleton")
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Configuración global</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Toggles y anuncios que aplican a todos los barrios de la plataforma.
      </p>

      {sp.saved && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-3 mb-4 text-sm">
          ✅ Config guardada.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-3 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form
        action={saveGlobalConfigAction}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5"
      >
        {/* Anuncio */}
        <div>
          <label className="block text-sm font-semibold mb-1">Anuncio global</label>
          <p className="text-xs text-zinc-500 mb-2">
            Aparece como banner arriba en los paneles de todos los admins de barrios. Dejalo vacío
            para no mostrar nada.
          </p>
          <textarea
            name="announcement"
            defaultValue={cfg?.announcement ?? ""}
            rows={3}
            placeholder='Ej: "Mantenimiento programado el sábado a las 22 hs."'
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
          />
          <div className="mt-2">
            <label className="text-xs text-zinc-400 mr-2">Tono:</label>
            <select
              name="announcement_level"
              defaultValue={cfg?.announcement_level ?? "info"}
              className="bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm"
            >
              <option value="info">Info (azul)</option>
              <option value="warning">Advertencia (amarillo)</option>
              <option value="danger">Crítico (rojo)</option>
            </select>
          </div>
        </div>

        {/* Toggles */}
        <div className="pt-4 border-t border-zinc-800 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="signup_open"
              defaultChecked={cfg?.signup_open ?? true}
              className="w-4 h-4 mt-1"
            />
            <div>
              <div className="text-sm font-semibold">Signup público abierto</div>
              <div className="text-xs text-zinc-500">
                Cuando está desactivado, la página <span className="font-mono">/signup</span> queda
                bloqueada — solo el super admin puede crear barrios (desde{" "}
                <span className="font-mono">/super/orgs/new</span>).
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="maintenance"
              defaultChecked={cfg?.maintenance ?? false}
              className="w-4 h-4 mt-1"
            />
            <div>
              <div className="text-sm font-semibold">Modo mantenimiento</div>
              <div className="text-xs text-zinc-500">
                Bloquea escrituras para todos los usuarios. Solo el guardia sigue pudiendo
                registrar ingresos (operación crítica).
              </div>
            </div>
          </label>
        </div>

        {cfg?.updated_at && (
          <p className="text-xs text-zinc-500 pt-3 border-t border-zinc-800">
            Última actualización: {new Date(cfg.updated_at).toLocaleString("es-AR")}
          </p>
        )}

        <button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-3"
        >
          Guardar config
        </button>
      </form>
    </div>
  );
}
