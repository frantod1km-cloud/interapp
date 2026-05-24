"use client";

import { revokeAuthAction } from "./actions";

// Botón "Eliminar" / "Revocar" con confirmación nativa antes de submit.
// El label y el mensaje cambian según si el link ya fue usado o no:
//   - No usado (claimed_at == null) → "Eliminar" (DELETE físico)
//   - Ya usado                     → "Revocar" (UPDATE revoked=true)
// La server action decide qué hacer realmente — este componente solo
// pinta y confirma.
export default function RevokeAuthButton({
  authId,
  claimed,
}: {
  authId: string;
  claimed: boolean;
}) {
  return (
    <form
      action={revokeAuthAction}
      onSubmit={(e) => {
        const msg = !claimed
          ? "¿Eliminar este link de invitación? No se va a poder usar más."
          : "¿Revocar esta autorización? El invitado no va a poder entrar más.";
        if (!confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="auth_id" value={authId} />
      <button
        type="submit"
        className="text-xs px-3 py-1 rounded bg-rose-900/40 hover:bg-rose-700 text-rose-200 hover:text-white border border-rose-900/50"
      >
        {claimed ? "Revocar" : "Eliminar"}
      </button>
    </form>
  );
}
