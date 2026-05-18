"use client";

import { useState } from "react";
import { addPersonVehicleAction, removePersonVehicleAction } from "./actions";

type Vehicle = {
  id: string;
  plate: string;
  make: string | null;
  model: string | null;
  color: string | null;
};

// Mini editor de vehículos de una persona autorizada por el residente.
// Cerrado por defecto, se abre con "Vehículos" para no llenar la lista.

export default function PersonVehicles({
  personId,
  vehicles,
}: {
  personId: string;
  vehicles: Vehicle[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-400 hover:text-white underline"
      >
        🚗 Vehículos ({vehicles.length})
      </button>
    );
  }

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-400 uppercase tracking-wider">Vehículos</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 hover:text-white"
        >
          Cerrar
        </button>
      </div>

      {vehicles.length === 0 && (
        <p className="text-xs text-zinc-500">Sin vehículos cargados.</p>
      )}

      {vehicles.map((v) => (
        <div
          key={v.id}
          className="flex items-center justify-between gap-2 py-1 border-b border-zinc-900 last:border-0"
        >
          <div>
            <div className="font-mono font-bold">{v.plate}</div>
            {(v.make || v.model || v.color) && (
              <div className="text-xs text-zinc-500">
                {[v.make, v.model, v.color].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <form action={removePersonVehicleAction}>
            <input type="hidden" name="vehicle_id" value={v.id} />
            <button className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-rose-700">
              Quitar
            </button>
          </form>
        </div>
      ))}

      <form
        action={addPersonVehicleAction}
        className="pt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 border-t border-zinc-900"
      >
        <input type="hidden" name="person_id" value={personId} />
        <input
          name="plate"
          placeholder="Patente"
          required
          className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm uppercase font-mono"
          style={{ textTransform: "uppercase" }}
        />
        <input
          name="make"
          placeholder="Marca"
          className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm"
        />
        <input
          name="model"
          placeholder="Modelo"
          className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm"
        />
        <input
          name="color"
          placeholder="Color"
          className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold rounded px-3 py-1.5"
        >
          Agregar
        </button>
      </form>
    </div>
  );
}
