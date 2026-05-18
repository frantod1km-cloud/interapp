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
      <Link href="/resident" className="text-sm text-zinc-700 hover:text-zinc-700 mb-4 inline-block">
        ← Volver
      </Link>
      <h1 className="text-2xl font-bold mb-2">Generar link para invitado</h1>
      <p className="text-sm text-zinc-700 mb-6">
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
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 font-semibold py-4 rounded-2xl">
          Generar link
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
