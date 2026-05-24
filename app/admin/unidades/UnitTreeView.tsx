"use client";

import { useState } from "react";
import type { TreeUnit } from "@/lib/units";
import {
  addUnitAction,
  bulkCreateUnitsAction,
  removeUnitAction,
  toggleUnitActiveAction,
  updateUnitAction,
} from "./actions";

// Vista de árbol con expand/collapse, alta de hijos y alta masiva por nivel.
// Cada nodo se renderiza recursivamente. El admin puede:
//   - Expandir/colapsar
//   - Agregar un hijo (si el nivel no es el último)
//   - Alta masiva de hijos numerados (ej. crear Lote 1 a 30)
//   - Editar el nombre
//   - Desactivar (recursivo) / reactivar
//   - Eliminar (si no hay residentes apuntando)
export default function UnitTreeView({
  tree,
  levels,
}: {
  tree: TreeUnit[];
  levels: string[];
}) {
  // Nodos raíz (nivel 1)
  return (
    <div className="space-y-2">
      <RootAdder levels={levels} />
      {tree.map((node) => (
        <Node key={node.id} node={node} levels={levels} initialOpen />
      ))}
    </div>
  );
}

function RootAdder({ levels }: { levels: string[] }) {
  const [open, setOpen] = useState(false);
  const rootLevel = levels[0];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-zinc-900 border border-dashed border-zinc-700 hover:border-emerald-600 text-emerald-400 font-semibold rounded-2xl p-3 text-sm"
      >
        + Agregar {rootLevel} de nivel raíz
      </button>
    );
  }

  return (
    <div className="bg-zinc-900 border border-emerald-600/40 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Nuevo {rootLevel} raíz</h3>
        <button onClick={() => setOpen(false)} className="text-zinc-400 text-sm hover:text-white">
          ✕
        </button>
      </div>
      <form action={addUnitAction} className="flex gap-2">
        <input
          name="label"
          required
          placeholder={`Nombre del ${rootLevel} (ej: Norte, A, 1…)`}
          className="flex-1 bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
        />
        <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
          Crear
        </button>
      </form>
      {levels.length > 1 && (
        <details>
          <summary className="cursor-pointer text-xs text-zinc-400 hover:text-white">
            ¿Querés crear varios {rootLevel}s de una?
          </summary>
          <form action={bulkCreateUnitsAction} className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              name="prefix"
              placeholder={`Prefijo (opcional, ej: "${rootLevel}")`}
              className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm sm:col-span-2"
            />
            <input
              type="number"
              name="from"
              required
              defaultValue="1"
              min="0"
              className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
            />
            <input
              type="number"
              name="to"
              required
              defaultValue="5"
              min="1"
              max="1000"
              className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
            />
            <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm sm:col-span-4">
              Crear masivo (desde→hasta)
            </button>
          </form>
        </details>
      )}
    </div>
  );
}

function Node({
  node,
  levels,
  initialOpen = false,
}: {
  node: TreeUnit;
  levels: string[];
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const isLeafLevel = node.level >= levels.length;
  const childLevel = levels[node.level]; // levels[level] porque level es 1-indexado
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div
      className={`border rounded-xl ${
        node.active ? "border-zinc-800 bg-zinc-900" : "border-zinc-900 bg-zinc-950 opacity-60"
      }`}
    >
      <div className="flex items-center gap-2 p-3">
        {!isLeafLevel && hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-zinc-400 hover:text-white w-6 text-center"
            aria-label={open ? "Colapsar" : "Expandir"}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-6 text-center text-zinc-700">·</span>
        )}

        <span className="text-xs uppercase tracking-wider opacity-60 font-mono">
          {node.kind ?? `Nivel ${node.level}`}
        </span>
        <span className="font-bold">{node.label}</span>

        {(node.residentCount ?? 0) > 0 && (
          <span className="text-xs bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded">
            👥 {node.residentCount} residente{node.residentCount === 1 ? "" : "s"}
          </span>
        )}
        {!node.active && (
          <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">Inactiva</span>
        )}

        <div className="ml-auto flex gap-1 flex-wrap">
          {!isLeafLevel && (
            <button
              onClick={() => setAdding((a) => !a)}
              className="text-xs px-2 py-1 rounded bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40"
            >
              + {childLevel}
            </button>
          )}
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
          >
            Editar
          </button>
          <form action={toggleUnitActiveAction}>
            <input type="hidden" name="unit_id" value={node.id} />
            <input type="hidden" name="active" value={node.active ? "false" : "true"} />
            <button className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">
              {node.active ? "Desactivar" : "Reactivar"}
            </button>
          </form>
          <form
            action={removeUnitAction}
            onSubmit={(e) => {
              if (!confirm(`¿Eliminar "${node.kind} ${node.label}" y toda su rama?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="unit_id" value={node.id} />
            <button className="text-xs px-2 py-1 rounded bg-rose-900/40 hover:bg-rose-800 text-rose-200">
              Eliminar
            </button>
          </form>
        </div>
      </div>

      {editing && (
        <form
          action={updateUnitAction}
          className="border-t border-zinc-800 p-3 flex gap-2"
          onSubmit={() => setEditing(false)}
        >
          <input type="hidden" name="unit_id" value={node.id} />
          <input
            name="label"
            defaultValue={node.label}
            required
            className="flex-1 bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
          />
          <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700"
          >
            Cancelar
          </button>
        </form>
      )}

      {adding && !isLeafLevel && (
        <div className="border-t border-zinc-800 p-3 space-y-3">
          <form action={addUnitAction} className="flex gap-2">
            <input type="hidden" name="parent_id" value={node.id} />
            <input
              name="label"
              required
              placeholder={`Nombre del ${childLevel} (ej: 1, 2, A…)`}
              className="flex-1 bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
            />
            <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
              Crear uno
            </button>
          </form>
          <details>
            <summary className="cursor-pointer text-xs text-zinc-400 hover:text-white">
              ¿Crear varios {childLevel}s numerados de una?
            </summary>
            <form
              action={bulkCreateUnitsAction}
              className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-2"
              onSubmit={() => setAdding(false)}
            >
              <input type="hidden" name="parent_id" value={node.id} />
              <input
                name="prefix"
                placeholder={`Prefijo opcional ("${childLevel}")`}
                className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm sm:col-span-2"
              />
              <input
                type="number"
                name="from"
                required
                defaultValue="1"
                min="0"
                className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
              />
              <input
                type="number"
                name="to"
                required
                defaultValue="20"
                min="1"
                max="1000"
                className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
              />
              <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm sm:col-span-4">
                Crear desde→hasta
              </button>
            </form>
          </details>
        </div>
      )}

      {open && hasChildren && (
        <div className="border-t border-zinc-800 p-3 pl-8 space-y-2">
          {node.children!.map((c) => (
            <Node key={c.id} node={c} levels={levels} />
          ))}
        </div>
      )}
    </div>
  );
}
