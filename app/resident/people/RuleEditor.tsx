"use client";

import { useState } from "react";
import { updatePersonRuleAction } from "./actions";

// Editor de regla horaria de una persona autorizada por el residente.
// Cerrado por defecto para no llenar la pantalla; al click se expande
// con presets de días y selects de hora.

const PRESETS = [
  { label: "Todos los días", mask: 127 },
  { label: "Lun a Vie", mask: 62 },
  { label: "Sáb y Dom", mask: 65 },
  { label: "Solo Lun, Mié, Vie", mask: 42 },
  { label: "Solo Mar, Jue", mask: 20 },
];

export default function RuleEditor({
  personId,
  ruleEnabled,
  weekdayMask,
  startHour,
  endHour,
}: {
  personId: string;
  ruleEnabled: boolean;
  weekdayMask: number;
  startHour: number;
  endHour: number;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-400 hover:text-white underline"
      >
        {ruleEnabled ? "Editar horario permitido" : "Configurar horario permitido"}
      </button>
    );
  }

  return (
    <form
      action={updatePersonRuleAction}
      className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-3"
    >
      <input type="hidden" name="person_id" value={personId} />

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          name="rule_enabled"
          defaultChecked={ruleEnabled}
          className="w-4 h-4"
        />
        <span>Aplicar restricción horaria</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Días</label>
          <select
            name="weekday_mask"
            defaultValue={weekdayMask}
            className="w-full bg-zinc-900 rounded px-2 py-1.5 border border-zinc-800 text-sm"
          >
            {PRESETS.map((p) => (
              <option key={p.mask} value={p.mask}>
                {p.label}
              </option>
            ))}
            {!PRESETS.some((p) => p.mask === weekdayMask) && (
              <option value={weekdayMask}>Custom ({weekdayMask})</option>
            )}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Desde</label>
          <select
            name="start_hour"
            defaultValue={startHour}
            className="w-full bg-zinc-900 rounded px-2 py-1.5 border border-zinc-800 text-sm"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Hasta</label>
          <select
            name="end_hour"
            defaultValue={endHour}
            className="w-full bg-zinc-900 rounded px-2 py-1.5 border border-zinc-800 text-sm"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, "0")}:59</option>
            ))}
          </select>
        </div>
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
