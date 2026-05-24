"use client";

import { useState } from "react";

// Combobox para elegir una unidad del barrio. Renderiza dos hidden inputs:
//   - unit_id  : el UUID de la unidad seleccionada (vacío si "Sin unidad")
//   - unit     : el label legacy (texto), por compatibilidad y display
//
// Si no encuentra coincidencias el guardia/admin puede dejar el texto que
// tipeó como "manual" (la action lo guarda como unit text sin unit_id).

type Unit = { id: string; label: string; kind: string };

const KIND_EMOJI: Record<string, string> = {
  lote: "🏞️",
  casa: "🏠",
  depto: "🏢",
  local: "🏪",
  oficina: "🏛️",
  otro: "📋",
};

export default function UnitPicker({
  units,
  defaultUnitId,
  defaultUnitLabel,
  required,
}: {
  units: Unit[];
  defaultUnitId?: string | null;
  defaultUnitLabel?: string | null;
  required?: boolean;
}) {
  const initial = defaultUnitId ? units.find((u) => u.id === defaultUnitId) : null;
  const [selected, setSelected] = useState<Unit | null>(initial ?? null);
  const [manual, setManual] = useState<string>(defaultUnitLabel ?? "");
  const [q, setQ] = useState("");

  const term = q.trim().toLowerCase();
  const filtered = term
    ? units
        .filter((u) => u.label.toLowerCase().includes(term))
        .slice(0, 8)
    : [];

  if (selected) {
    return (
      <div className="bg-zinc-950 border border-emerald-700/40 rounded-lg p-3 flex items-center justify-between gap-3">
        <input type="hidden" name="unit_id" value={selected.id} />
        <input type="hidden" name="unit" value={selected.label} />
        <div>
          <div className="font-semibold">
            {KIND_EMOJI[selected.kind] ?? "📋"} {selected.label}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setQ("");
          }}
          className="text-xs text-zinc-400 hover:text-white underline"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input type="hidden" name="unit_id" value="" />
      <input type="hidden" name="unit" value={manual} />
      <input
        type="text"
        value={q || manual}
        onChange={(e) => {
          setQ(e.target.value);
          setManual(e.target.value);
        }}
        placeholder="Unidad (ej: Lote 42, Depto 3B)"
        autoComplete="off"
        required={required}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2"
      />
      {filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg divide-y divide-zinc-800 max-h-64 overflow-y-auto shadow-lg">
          {filtered.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(u);
                  setQ("");
                  setManual("");
                }}
                className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-3"
              >
                <span className="text-base">{KIND_EMOJI[u.kind] ?? "📋"}</span>
                <span className="font-medium text-sm">{u.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q && filtered.length === 0 && (
        <p className="text-xs text-zinc-500 mt-1">
          Sin coincidencias. Se va a guardar como texto libre. Si querés que sea una unidad
          formal, agregala primero en <a href="/admin/unidades" className="underline">Unidades</a>.
        </p>
      )}
    </div>
  );
}
