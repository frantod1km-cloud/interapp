import Link from "next/link";
import { createInviteAction } from "../actions";

export const dynamic = "force-dynamic";

export default function NewInvitePage() {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localIso = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);

  return (
    <div>
      <Link href="/resident" className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 inline-block">
        ← Volver
      </Link>
      <h1 className="text-2xl font-bold mb-2">Generar link para invitado</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Compartile el link al invitado. Cuando lo abra y cargue su DNI, queda autorizado
        automáticamente.
      </p>
      <form action={createInviteAction} className="space-y-4">
        <Field label="Nota (opcional, ej: 'Cumpleaños sábado')" name="note" />
        <Field
          label="Válido hasta"
          name="valid_until"
          type="datetime-local"
          defaultValue={localIso}
          required
        />
        <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 font-semibold py-4 rounded-2xl">
          Generar link
        </button>
      </form>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm mb-1 text-zinc-400">{label}</label>
      <input {...props} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3" />
    </div>
  );
}
