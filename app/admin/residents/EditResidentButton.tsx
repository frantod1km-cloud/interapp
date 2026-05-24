"use client";

import { useState } from "react";
import { RESIDENT_KINDS } from "@/lib/resident-kinds";
import type { LeafUnit } from "@/lib/units";
import { editResidentAction } from "./actions";
import UnitPicker from "./UnitPicker";

export type ResidentForEdit = {
  id: string;
  dni: string;
  first_name: string;
  last_name: string;
  unit: string | null;
  unit_id: string | null;
  phone: string | null;
  kind: string;
};

// Botón "Editar" con modal de edición. Permite cambiar todos los campos
// básicos del residente, incluyendo el DNI (que se re-normaliza al
// guardar — sirve para arreglar registros viejos con datos rotos).
export default function EditResidentButton({
  resident,
  leaves,
}: {
  resident: ResidentForEdit;
  leaves: LeafUnit[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
      >
        Editar
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 sm:p-12 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                Editar: {resident.last_name}, {resident.first_name}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-white text-sm px-2"
              >
                ✕
              </button>
            </div>

            <form action={editResidentAction} className="p-4 space-y-3">
              <input type="hidden" name="resident_id" value={resident.id} />

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Categoría</label>
                <select
                  name="kind"
                  defaultValue={resident.kind}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2"
                >
                  {RESIDENT_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.emoji} {k.short}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">DNI</label>
                  <input
                    name="dni"
                    defaultValue={resident.dni}
                    placeholder="DNI"
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Se guarda normalizado a 8 dígitos.
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Teléfono</label>
                  <input
                    name="phone"
                    defaultValue={resident.phone ?? ""}
                    placeholder="Teléfono"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Nombre</label>
                  <input
                    name="first_name"
                    defaultValue={resident.first_name}
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Apellido</label>
                  <input
                    name="last_name"
                    defaultValue={resident.last_name}
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Unidad</label>
                <UnitPicker
                  leaves={leaves}
                  defaultUnitId={resident.unit_id}
                  defaultUnitLabel={resident.unit}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="text-sm px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
