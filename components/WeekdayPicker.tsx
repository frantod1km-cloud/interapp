"use client";

import { useState } from "react";

// Selector de días de la semana con chips individuales + atajos rápidos.
// Cada chip representa un bit del weekday_mask (bit 0 = domingo, ..., bit 6 = sábado).
// Renderiza un input hidden con el valor agregado para que se envíe en el form.
//
// Uso:
//   <WeekdayPicker name="weekday_mask" defaultValue={62} />

const DAYS = [
  { idx: 0, label: "Dom" },
  { idx: 1, label: "Lun" },
  { idx: 2, label: "Mar" },
  { idx: 3, label: "Mié" },
  { idx: 4, label: "Jue" },
  { idx: 5, label: "Vie" },
  { idx: 6, label: "Sáb" },
];

const PRESETS = [
  { label: "Todos", mask: 127 },
  { label: "Lun-Vie", mask: 62 },
  { label: "Sáb-Dom", mask: 65 },
  { label: "Ninguno", mask: 0 },
];

export default function WeekdayPicker({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: number;
}) {
  const [mask, setMask] = useState(defaultValue);

  const toggle = (bit: number) => {
    setMask((m) => m ^ (1 << bit));
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={mask} />
      <div className="flex gap-1 flex-wrap">
        {DAYS.map((d) => {
          const on = (mask & (1 << d.idx)) !== 0;
          return (
            <button
              key={d.idx}
              type="button"
              onClick={() => toggle(d.idx)}
              className={`text-xs font-bold w-12 py-2 rounded transition ${
                on
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
              }`}
              aria-pressed={on}
            >
              {d.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1 flex-wrap">
        <span className="text-xs text-zinc-500 self-center mr-1">Atajos:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setMask(p.mask)}
            className="text-xs px-2 py-1 rounded bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-white"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
