"use client";

import { useState } from "react";
import { formatDni } from "@/lib/dni/parse";
import { kindMeta } from "@/lib/resident-kinds";

// Combobox para elegir el residente al cargar un vehículo. Necesario cuando
// el barrio tiene muchos residentes y el <select> nativo se vuelve incómodo.

type Resident = {
  id: string;
  first_name: string;
  last_name: string;
  unit: string | null;
  dni: string;
  kind: string;
};

export default function VehicleResidentPicker({ residents }: { residents: Resident[] }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Resident | null>(null);

  const term = q.trim().toLowerCase();
  const filtered = term
    ? residents
        .filter((r) => {
          const hay = `${r.dni} ${r.first_name} ${r.last_name} ${r.unit ?? ""}`.toLowerCase();
          return hay.includes(term);
        })
        .slice(0, 8)
    : [];

  if (selected) {
    const km = kindMeta(selected.kind);
    return (
      <div className="bg-zinc-950 border border-emerald-700/40 rounded-lg p-3 flex items-center justify-between gap-3">
        <input type="hidden" name="resident_id" value={selected.id} />
        <div>
          <div className="font-semibold">
            {km.emoji} {selected.last_name}, {selected.first_name}
          </div>
          <div className="text-xs text-zinc-400">
            DNI {formatDni(selected.dni)} {selected.unit && `· ${selected.unit}`}
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
      <input type="hidden" name="resident_id" value="" required />
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar residente (nombre, DNI, lote)…"
        autoComplete="off"
        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2"
      />
      {filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg divide-y divide-zinc-800 max-h-64 overflow-y-auto shadow-lg">
          {filtered.map((r) => {
            const km = kindMeta(r.kind);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(r);
                    setQ("");
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-3"
                >
                  <span className="text-base">{km.emoji}</span>
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {r.last_name}, {r.first_name}
                    </div>
                    <div className="text-xs text-zinc-400">
                      DNI {formatDni(r.dni)} {r.unit && `· ${r.unit}`}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {q && filtered.length === 0 && (
        <p className="text-xs text-zinc-500 mt-1">Sin resultados.</p>
      )}
    </div>
  );
}
