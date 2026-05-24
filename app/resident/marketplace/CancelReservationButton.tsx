"use client";

import { cancelReservationAction } from "./actions";

// Botón para cancelar una reserva pending_payment. Confirmación nativa.
// Las confirmed se cancelan desde el admin (requiere reembolso por MP).
export default function CancelReservationButton({
  reservationId,
}: {
  reservationId: string;
}) {
  return (
    <form
      action={cancelReservationAction}
      onSubmit={(e) => {
        if (!confirm("¿Cancelar esta reserva pendiente de pago?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="reservation_id" value={reservationId} />
      <button
        type="submit"
        className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-rose-700 text-zinc-300 hover:text-white"
      >
        Cancelar
      </button>
    </form>
  );
}
