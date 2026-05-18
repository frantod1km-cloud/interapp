"use client";

import { useState } from "react";
import WeekdayPicker from "@/components/WeekdayPicker";
import { updatePersonRuleAction } from "./actions";

// Editor de regla horaria de una persona autorizada por el residente.
// Cerrado por defecto para no llenar la pantalla; al click se expande
// con chips de días individuales + selects de hora.

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
        className="text-xs text-zinc-700 hover:text-zinc-900 underline"
      >
        {ruleEnabled ? "Editar horario permitido" : "Configurar horario permitido"}
      </button>
    );
  }

  return (
    <form
      action={updatePersonRuleAction}
      className="bg-white border border-zinc-200 rounded-lg p-3 space-y-3"
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

      <div>
        <label className="block text-xs text-zinc-700 mb-2">Días permitidos</label>
        <WeekdayPicker name="weekday_mask" defaultValue={weekdayMask} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-zinc-700 mb-1">Desde</label>
          <select
            name="start_hour"
            defaultValue={startHour}
            className="w-full bg-white border border-zinc-200 rounded px-2 py-1.5 border border-zinc-200 text-sm"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-700 mb-1">Hasta</label>
          <select
            name="end_hour"
            defaultValue={endHour}
            className="w-full bg-white border border-zinc-200 rounded px-2 py-1.5 border border-zinc-200 text-sm"
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
          className="flex-1 text-sm bg-zinc-100 hover:bg-zinc-200 py-2 rounded"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 text-sm bg-blue-600 hover:bg-blue-500 font-semibold py-2 rounded"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}
