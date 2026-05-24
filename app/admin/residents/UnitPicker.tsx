"use client";

import { useMemo, useState } from "react";
import type { LeafUnit } from "@/lib/units";

// Picker jerárquico de unidades. Combobox con búsqueda contra el listado de
// hojas (los nodos sin hijos del árbol). Cada opción muestra el breadcrumb
// para que el admin sepa exactamente a qué unidad apunta.
//
// Renderiza dos hidden inputs:
//   - unit_id  : el UUID de la hoja seleccionada (vacío si "Sin asignar")
//   - unit     : el label de la hoja, por compat con código viejo que lee
//                el campo `unit` text. Se sigue guardando para que la
//                migración a árbol sea progresiva.
//
// Si no hay hojas cargadas (la org acaba de configurar niveles), muestra un
// CTA al wizard de carga.
export default function UnitPicker({
  leaves,
  defaultUnitId,
  defaultUnitLabel,
  required,
  allowEmpty = true,
}: {
  leaves: LeafUnit[];
  defaultUnitId?: string | null;
  defaultUnitLabel?: string | null;
  required?: boolean;
  allowEmpty?: boolean;
}) {
  const initial = useMemo(
    () => (defaultUnitId ? leaves.find((l) => l.id === defaultUnitId) : null) ?? null,
    [defaultUnitId, leaves],
  );
  const [selected, setSelected] = useState<LeafUnit | null>(initial);
  const [q, setQ] = useState("");

  const term = q.trim().toLowerCase();
  const filtered = term
    ? leaves
        .filter((l) =>
          l.full_path.toLowerCase().includes(term) || l.label.toLowerCase().includes(term),
        )
        .slice(0, 12)
    : leaves.slice(0, 12);

  if (leaves.length === 0) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-3 text-sm">
        <div className="mb-2">⚠️ Todavía no cargaste unidades en el árbol.</div>
        <a
          href="/admin/unidades"
          className="inline-block bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 rounded"
        >
          Ir a cargar unidades →
        </a>
        <input type="hidden" name="unit_id" value="" />
        <input type="hidden" name="unit" value={defaultUnitLabel ?? ""} />
      </div>
    );
  }

  if (selected) {
    return (
      <div className="bg-zinc-950 border border-emerald-700/40 rounded-lg p-3 flex items-center justify-between gap-3">
        <input type="hidden" name="unit_id" value={selected.id} />
        <input type="hidden" name="unit" value={selected.label} />
        <div className="min-w-0">
          <div className="font-semibold truncate">
            {selected.kind} {selected.label}
          </div>
          {selected.breadcrumb && (
            <div className="text-xs text-zinc-400 truncate">{selected.breadcrumb}</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setQ("");
          }}
          className="text-xs text-zinc-400 hover:text-white underline flex-shrink-0"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input type="hidden" name="unit_id" value="" />
      <input type="hidden" name="unit" value={defaultUnitLabel ?? ""} />
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Buscar unidad… (${leaves.length} disponibles)`}
        autoComplete="off"
        required={required}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2"
      />
      <ul className="absolute z-20 mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg divide-y divide-zinc-800 max-h-72 overflow-y-auto shadow-lg">
        {allowEmpty && (
          <li>
            <button
              type="button"
              onClick={() =>
                setSelected({
                  id: "",
                  label: "",
                  kind: null,
                  level: 0,
                  parent_id: null,
                  breadcrumb: "",
                  full_path: "Sin asignar",
                } as unknown as LeafUnit)
              }
              className="w-full text-left px-4 py-2 hover:bg-zinc-900 text-zinc-400 text-sm italic"
            >
              — Sin asignar —
            </button>
          </li>
        )}
        {filtered.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => {
                setSelected(l);
                setQ("");
              }}
              className="w-full text-left px-4 py-2 hover:bg-zinc-900"
            >
              <div className="font-semibold text-sm">
                {l.kind} {l.label}
              </div>
              {l.breadcrumb && (
                <div className="text-xs text-zinc-500 truncate">{l.breadcrumb}</div>
              )}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-3 text-xs text-zinc-500">
            Sin coincidencias.{" "}
            <a href="/admin/unidades" className="underline">
              Cargá la unidad
            </a>{" "}
            primero.
          </li>
        )}
      </ul>
    </div>
  );
}
