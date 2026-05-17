"use client";

import { useState } from "react";
import { updatePersonExpiryAction } from "./actions";

// Editor de fecha de vencimiento del acceso de una persona.
// Cerrado por defecto. Al abrirlo, calendario nativo + botón "sin vencimiento"
// para borrar.

export default function ExpiryEditor({
  personId,
  currentExpiresAt,
}: {
  personId: string;
  currentExpiresAt: string | null;
}) {
  const [open, setOpen] = useState(false);

  const formattedDate = currentExpiresAt
    ? new Date(currentExpiresAt).toISOString().slice(0, 10)
    : "";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-400 hover:text-white underline"
      >
        {currentExpiresAt ? "Cambiar fecha de vencimiento" : "Definir fecha de vencimiento"}
      </button>
    );
  }

  return (
    <form
      action={updatePersonExpiryAction}
      className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-3"
    >
      <input type="hidden" name="person_id" value={personId} />

      <div>
        <label className="block text-xs text-zinc-400 mb-1">
          Acceso válido hasta (último día permitido)
        </label>
        <input
          type="date"
          name="access_expires_at"
          defaultValue={formattedDate}
          className="w-full bg-zinc-900 rounded px-3 py-2 border border-zinc-800 text-sm"
        />
        <p className="text-xs text-zinc-500 mt-1">
          Dejá vacío para acceso permanente sin vencimiento.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 text-sm bg-zinc-800 hover:bg-zinc-700 py-2 rounded"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 text-sm bg-emerald-600 hover:bg-emerald-500 font-semibold py-2 rounded"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}
