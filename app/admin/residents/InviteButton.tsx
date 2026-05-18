"use client";

import { useState } from "react";
import { inviteResidentAction } from "./actions";

// Botón "Invitar" que despliega un mini-form inline para crear la cuenta
// del residente sin salir de la página.

export default function InviteButton({
  residentId,
  fullName,
}: {
  residentId: string;
  fullName: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
      >
        Invitar
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={() => setOpen(false)}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm">
          <h3 className="font-bold mb-1">Crear cuenta para {fullName}</h3>
          <p className="text-sm text-zinc-400 mb-4">
            Pasale estos datos al residente para que se loguee desde su celular.
          </p>
          <form action={inviteResidentAction} className="space-y-3">
            <input type="hidden" name="resident_id" value={residentId} />
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              autoFocus
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
            />
            <input
              name="password"
              type="text"
              placeholder="Contraseña (mín. 8)"
              required
              minLength={8}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-semibold py-2 rounded-lg text-sm"
              >
                Crear cuenta
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
