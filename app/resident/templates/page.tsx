import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import { createTemplateAction, deleteTemplateAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: resident } = await supabase
    .from("residents")
    .select("id")
    .eq("organization_id", org.id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!resident) {
    return (
      <div>
        <Link href="/resident" className="text-sm text-zinc-700 hover:text-zinc-700 mb-4 inline-block">
          ← Volver
        </Link>
        <p className="text-zinc-700 text-sm">No estás asociado como residente.</p>
      </div>
    );
  }

  const { data: templates } = await supabase
    .from("visit_templates")
    .select("id, label, dni, visitor_name, default_until_hour, notes")
    .eq("resident_id", resident.id)
    .order("label");

  return (
    <div>
      <Link href="/resident" className="text-sm text-zinc-700 hover:text-zinc-700 mb-4 inline-block">
        ← Volver
      </Link>
      <h1 className="text-2xl font-bold mb-2">Visitas recurrentes</h1>
      <p className="text-zinc-700 text-sm mb-6">
        Guardá personas que vienen seguido (empleada, jardinero, profe) para autorizarlas con
        un solo toque cuando vengan.
      </p>

      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-700">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form action={createTemplateAction} className="bg-white border border-zinc-200 rounded-2xl p-4 mb-6 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input name="label" placeholder='Etiqueta (ej: "Empleada")' required className="bg-white rounded px-3 py-2 border border-zinc-200" />
          <input name="dni" placeholder="DNI" inputMode="numeric" required className="bg-white rounded px-3 py-2 border border-zinc-200" />
          <input name="visitor_name" placeholder="Nombre completo" required className="bg-white rounded px-3 py-2 border border-zinc-200 sm:col-span-2" />
          <div>
            <label className="block text-xs text-zinc-700 mb-1">Hora habitual de salida</label>
            <select name="default_until_hour" defaultValue={18} className="w-full bg-white rounded px-3 py-2 border border-zinc-200">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>
          <input name="notes" placeholder="Notas (opcional)" className="bg-white rounded px-3 py-2 border border-zinc-200" />
        </div>
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 font-semibold rounded px-4 py-3">
          Guardar plantilla
        </button>
      </form>

      <div className="space-y-2">
        {(templates ?? []).length === 0 && (
          <p className="text-zinc-700 text-sm text-center py-6">
            Todavía no tenés plantillas. Cargá la primera arriba.
          </p>
        )}
        {(templates ?? []).map((t) => (
          <div key={t.id} className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="font-bold">{t.label}</div>
                <div className="text-sm text-zinc-700">
                  {t.visitor_name} · DNI {formatDni(t.dni)}
                </div>
                <div className="text-xs text-zinc-700">
                  Hasta las {String(t.default_until_hour).padStart(2, "0")}:00
                  {t.notes && ` · ${t.notes}`}
                </div>
              </div>
              <form action={deleteTemplateAction}>
                <input type="hidden" name="template_id" value={t.id} />
                <button className="text-xs px-3 py-1 rounded bg-zinc-100 hover:bg-rose-700">
                  Eliminar
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
