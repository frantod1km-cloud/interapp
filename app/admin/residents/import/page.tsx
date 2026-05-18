import Link from "next/link";
import { importResidentsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ImportResidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; preview?: string }>;
}) {
  const sp = await searchParams;
  const okCount = sp.ok ? parseInt(sp.ok) : 0;

  return (
    <div>
      <Link href="/admin/residents" className="text-sm text-zinc-400 hover:text-zinc-400 mb-4 inline-block">
        ← Volver
      </Link>
      <h1 className="text-2xl font-bold mb-2">Importar residentes desde CSV</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Pegá el contenido de un CSV con una fila por residente. Aceptamos coma (<code>,</code>),
        punto y coma (<code>;</code>) o tab como separador.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6 text-sm">
        <div className="font-semibold mb-2">Formato esperado (con o sin encabezado):</div>
        <pre className="bg-black/40 rounded p-3 text-xs overflow-x-auto">
{`dni,first_name,last_name,unit,phone
35123456,Juan,García,Lote 42,1144556677
28999111,María,López,Lote 18,1133445566`}
        </pre>
        <p className="text-zinc-400 text-xs mt-2">
          <strong>dni, nombre y apellido</strong> son obligatorios. Unidad y teléfono son opcionales.
          Si un DNI ya existe en el barrio, esa fila se omite.
        </p>
      </div>

      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300 whitespace-pre-wrap">
          {decodeURIComponent(sp.error)}
        </div>
      )}
      {okCount > 0 && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-4 mb-4 text-sm">
          ✅ Se importaron {okCount} residentes.{" "}
          <Link href="/admin/residents" className="underline">Ver listado</Link>.
        </div>
      )}

      <form action={importResidentsAction} className="space-y-4">
        <textarea
          name="csv"
          required
          rows={12}
          placeholder="dni,nombre,apellido,unidad,telefono..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 font-mono text-sm"
        />
        <div className="flex gap-3">
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded-lg px-6 py-3"
          >
            Importar
          </button>
          <Link
            href="/admin/residents"
            className="bg-zinc-800 hover:bg-zinc-700 font-semibold rounded-lg px-6 py-3"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
