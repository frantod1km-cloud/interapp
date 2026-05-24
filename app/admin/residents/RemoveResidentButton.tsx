"use client";

import { removeResidentAction } from "./actions";

// Botón "Eliminar" con confirmación nativa antes de submit.
// Si el residente tiene historial (vehículos, autorizaciones, eventos)
// el server lo va a rechazar con un error explicando que hay que desactivar.
export default function RemoveResidentButton({
  residentId,
  fullName,
}: {
  residentId: string;
  fullName: string;
}) {
  return (
    <form
      action={removeResidentAction}
      onSubmit={(e) => {
        if (
          !confirm(
            `¿Eliminar definitivamente a ${fullName}?\n\nEsto NO se puede deshacer. Si la persona ya tiene historial (visitas, ingresos, autos), no se va a poder borrar — desactivá en su lugar.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="resident_id" value={residentId} />
      <button
        type="submit"
        className="text-xs px-3 py-1 rounded bg-rose-900/40 hover:bg-rose-800 text-rose-200 hover:text-white border border-rose-900/50"
      >
        Eliminar
      </button>
    </form>
  );
}
