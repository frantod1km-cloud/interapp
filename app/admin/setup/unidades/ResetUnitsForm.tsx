"use client";

import { useState } from "react";

// Form de reseteo: pide tipear "BORRAR TODO" para confirmar el wipe del
// árbol entero. El server además valida el string para que no haya forma
// de gatillarlo por error.
export default function ResetUnitsForm({
  action,
  totalUnits,
}: {
  action: (formData: FormData) => Promise<void>;
  totalUnits: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-rose-900/40 hover:bg-rose-800 text-rose-200 hover:text-white font-semibold rounded px-4 py-2 text-sm border border-rose-900/50"
      >
        Borrar las {totalUnits} unidades y empezar de cero
      </button>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <p className="text-sm text-rose-200">
        Para confirmar, escribí exactamente <strong className="font-mono">BORRAR TODO</strong>:
      </p>
      <div className="flex gap-2">
        <input
          name="confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="BORRAR TODO"
          autoFocus
          className="flex-1 bg-zinc-950 border border-rose-900 rounded px-3 py-2 text-sm font-mono"
        />
        <button
          type="submit"
          disabled={confirm !== "BORRAR TODO"}
          className="bg-rose-700 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded px-4 py-2 text-sm"
        >
          Borrar todo
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirm("");
          }}
          className="text-sm px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
