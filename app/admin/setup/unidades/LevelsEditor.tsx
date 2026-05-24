"use client";

import { useState } from "react";
import { saveUnitLevelsAction } from "../../unidades/actions";

// Editor de niveles del organigrama. El admin puede agregar/quitar niveles
// (si no hay unidades ya cargadas) o solo renombrarlos.
export default function LevelsEditor({
  initial,
  canChangeCount,
}: {
  initial: string[];
  canChangeCount: boolean;
}) {
  const [levels, setLevels] = useState<string[]>(initial.length > 0 ? initial : [""]);

  const update = (i: number, v: string) => {
    setLevels((arr) => arr.map((x, idx) => (idx === i ? v : x)));
  };
  const remove = (i: number) => {
    if (!canChangeCount) return;
    setLevels((arr) => arr.filter((_, idx) => idx !== i));
  };
  const add = () => {
    if (!canChangeCount) return;
    if (levels.length >= 5) return;
    setLevels((arr) => [...arr, ""]);
  };

  return (
    <form action={saveUnitLevelsAction} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
      {levels.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-zinc-500 text-sm w-6">{i + 1}.</span>
          <input
            name="levels"
            value={l}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`Nombre del nivel ${i + 1}`}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2"
            required
          />
          {canChangeCount && levels.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-rose-300 hover:text-white px-2"
              aria-label="Quitar nivel"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {canChangeCount && levels.length < 5 && (
        <button
          type="button"
          onClick={add}
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          + Agregar otro nivel
        </button>
      )}

      <div className="border-t border-zinc-800 pt-3 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Ej: Sector → Etapa → Lote. Mínimo 1 nivel, máximo 5.
        </p>
        <button
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-5 py-2"
        >
          Guardar niveles
        </button>
      </div>
    </form>
  );
}
