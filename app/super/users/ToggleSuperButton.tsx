"use client";

import { toggleSuperAction } from "../actions";

export default function ToggleSuperButton({
  userId,
  isSuper,
  email,
}: {
  userId: string;
  isSuper: boolean;
  email: string;
}) {
  const label = isSuper ? "Quitar super" : "Hacer super";
  const confirmMsg = isSuper
    ? `¿Quitar permisos de super admin a ${email}?`
    : `¿Otorgar permisos de super admin a ${email}?\n\nPodrá ver todos los barrios y hacer cambios sensibles.`;
  return (
    <form
      action={toggleSuperAction}
      onSubmit={(e) => {
        if (!confirm(confirmMsg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="make_super" value={isSuper ? "false" : "true"} />
      <button
        type="submit"
        className={`text-xs px-3 py-1 rounded border ${
          isSuper
            ? "bg-rose-900/40 hover:bg-rose-800 text-rose-200 border-rose-900/50"
            : "bg-violet-600/30 hover:bg-violet-600 text-violet-200 border-violet-700/50"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
