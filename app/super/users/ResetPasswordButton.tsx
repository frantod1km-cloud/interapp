"use client";

import { useState } from "react";
import { resetUserPasswordAction } from "../actions";

export default function ResetPasswordButton({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
      >
        Reset pass
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold mb-1">Reset password</h3>
        <p className="text-sm text-zinc-400 mb-4">
          Nueva contraseña para <span className="font-mono">{email}</span>. El usuario ya no podrá
          entrar con la anterior.
        </p>
        <form
          action={resetUserPasswordAction}
          onSubmit={() => setOpen(false)}
          className="space-y-3"
        >
          <input type="hidden" name="user_id" value={userId} />
          <input
            name="new_password"
            type="password"
            required
            minLength={10}
            autoFocus
            placeholder="Nueva contraseña (mín 10)"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="text-sm px-4 py-2 rounded bg-rose-700 hover:bg-rose-600 font-semibold"
            >
              Cambiar contraseña
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
