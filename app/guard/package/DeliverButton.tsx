"use client";

import { useState } from "react";
import { deliverPackageAction } from "@/app/admin/packages/actions";

// Botón de entrega que cambia su comportamiento si el paquete tiene un PIN
// activado para retiro por tercero. Sin PIN: entrega directa con un click.
// Con PIN: se abre un input para que el guardia tipee el PIN que le mostró
// el visitante.

export default function DeliverButton({
  packageId,
  hasPin,
  pinHolder,
  defaultDeliveredTo,
}: {
  packageId: string;
  hasPin: boolean;
  pinHolder: string | null;
  defaultDeliveredTo: string;
}) {
  const [open, setOpen] = useState(false);

  if (!hasPin) {
    return (
      <form action={deliverPackageAction}>
        <input type="hidden" name="package_id" value={packageId} />
        <input type="hidden" name="delivered_to" value={defaultDeliveredTo} />
        <button className="bg-blue-600 hover:bg-blue-500 font-semibold text-sm px-4 py-2 rounded-lg w-full">
          Entregar
        </button>
      </form>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-amber-600 hover:bg-amber-500 font-semibold text-sm px-4 py-2 rounded-lg w-full"
      >
        🔑 Entregar con PIN
      </button>
    );
  }

  return (
    <form action={deliverPackageAction} className="bg-white border border-amber-600/40 rounded-lg p-3 space-y-2 w-56">
      <input type="hidden" name="package_id" value={packageId} />
      <div className="text-xs text-zinc-700">
        El residente autorizó a un tercero{pinHolder ? ` (${pinHolder})` : ""}. Pediles el PIN.
      </div>
      <input
        name="pin"
        inputMode="numeric"
        autoFocus
        required
        placeholder="PIN de 6 dígitos"
        className="w-full bg-white border border-zinc-200 rounded px-3 py-2 text-center font-mono text-lg tracking-widest"
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs bg-zinc-100 hover:bg-zinc-200 py-2 rounded"
        >
          Cancelar
        </button>
        <button className="text-xs bg-blue-600 hover:bg-blue-500 font-semibold py-2 rounded">
          Entregar
        </button>
      </div>
    </form>
  );
}
