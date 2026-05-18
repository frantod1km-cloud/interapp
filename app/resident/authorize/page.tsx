import Link from "next/link";
import { authorizeVisitAction } from "../actions";

export const dynamic = "force-dynamic";

export default function AuthorizePage() {
  // default: hoy a las 23:59 local, formato datetime-local
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localIso = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);

  return (
    <div>
      <Link href="/resident" className="text-sm text-zinc-700 hover:text-zinc-700 mb-4 inline-block">
        ← Volver
      </Link>
      <h1 className="text-2xl font-bold mb-6">Autorizar visita</h1>
      <form action={authorizeVisitAction} className="space-y-4">
        <Field label="DNI del visitante" name="dni" type="text" inputMode="numeric" required autoFocus />
        <Field label="Nombre (opcional)" name="visitor_name" />
        <Field label="Válido hasta" name="valid_until" type="datetime-local" defaultValue={localIso} required />
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 font-semibold py-4 rounded-2xl">
          Autorizar
        </button>
      </form>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm mb-1 text-zinc-700">{label}</label>
      <input {...props} className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3" />
    </div>
  );
}
