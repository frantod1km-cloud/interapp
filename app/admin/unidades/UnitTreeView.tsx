"use client";

import { useState } from "react";
import type { TreeUnit } from "@/lib/units";
import {
  addSpecialUnitAction,
  addUnitAction,
  bulkCreateUnitsAction,
  removeUnitAction,
  toggleUnitActiveAction,
  updateUnitAction,
} from "./actions";

// Presets de espacios especiales. El admin puede tipear cualquier otro.
const SPECIAL_KINDS: Array<{ kind: string; emoji: string }> = [
  { kind: "Club House", emoji: "🏛️" },
  { kind: "Pileta", emoji: "🏊" },
  { kind: "Estacionamiento", emoji: "🅿️" },
  { kind: "Cancha de tenis", emoji: "🎾" },
  { kind: "Cancha de fútbol", emoji: "⚽" },
  { kind: "Quincho", emoji: "🔥" },
  { kind: "Gimnasio", emoji: "🏋️" },
  { kind: "SUM / Salón", emoji: "🎉" },
  { kind: "Cochera", emoji: "🚗" },
  { kind: "Bauleras", emoji: "📦" },
  { kind: "Administración", emoji: "📋" },
  { kind: "Garita", emoji: "👮" },
];

// Devuelve emoji para un kind dado (matchea contra los presets, o fallback)
function emojiForKind(kind: string | null): string {
  if (!kind) return "📍";
  const lk = kind.toLowerCase();
  const match = SPECIAL_KINDS.find((s) => s.kind.toLowerCase() === lk);
  if (match) return match.emoji;
  return "📍";
}

function isSpecialKind(kind: string | null, levelNames: string[]): boolean {
  if (!kind) return false;
  return !levelNames.some((l) => l.toLowerCase() === kind.toLowerCase());
}

export default function UnitTreeView({
  tree,
  levels,
}: {
  tree: TreeUnit[];
  levels: string[];
}) {
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
        + Agregar nodo de nivel raíz ({rootLevel} o espacio especial)
      </button>
    );
  }

  return (
    <div className="bg-zinc-900 border border-emerald-600/40 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Nuevo nodo raíz</h3>
        <button onClick={() => setOpen(false)} className="text-zinc-400 text-sm hover:text-white">
          ✕
        </button>
      </div>
      <AddForms
        parentId={null}
        childLevelName={rootLevel}
        canGoDeeper={levels.length > 1}
        onDone={() => setOpen(false)}
      />
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
  const childLevel = levels[node.level];
  const hasChildren = (node.children?.length ?? 0) > 0;
  const special = isSpecialKind(node.kind, levels);

  return (
    <div
      className={`border rounded-xl ${
        node.active
          ? special
            ? "border-violet-700/40 bg-violet-950/20"
            : "border-zinc-800 bg-zinc-900"
          : "border-zinc-900 bg-zinc-950 opacity-60"
      }`}
    >
      <div className="flex items-center gap-2 p-3 flex-wrap">
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

        <span className="text-base">{emojiForKind(node.kind)}</span>
        <span
          className={`text-xs uppercase tracking-wider font-mono ${
            special ? "text-violet-300" : "opacity-60"
          }`}
        >
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
              + Agregar adentro
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
        <div className="border-t border-zinc-800 p-3">
          <AddForms
            parentId={node.id}
            childLevelName={childLevel}
            canGoDeeper={node.level + 1 < levels.length}
            onDone={() => setAdding(false)}
          />
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

// ---------------------------------------------------------------------------
// AddForms: tabs para los 4 modos de alta. Se reusa para nodos raíz y para
// hijos de un nodo existente.
// ---------------------------------------------------------------------------
type AddTab = "single" | "numeric" | "letters" | "list" | "special";

function AddForms({
  parentId,
  childLevelName,
  onDone,
}: {
  parentId: string | null;
  childLevelName: string;
  canGoDeeper: boolean;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<AddTab>("single");

  const tabs: Array<{ id: AddTab; label: string }> = [
    { id: "single", label: `+ Uno (${childLevelName})` },
    { id: "numeric", label: "Rango numérico" },
    { id: "letters", label: "Rango alfabético" },
    { id: "list", label: "Lista libre" },
    { id: "special", label: "✨ Espacio especial" },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-3 border-b border-zinc-800 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`text-xs px-3 py-1.5 rounded ${
              tab === t.id
                ? "bg-emerald-600 text-white font-semibold"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "single" && (
        <form action={addUnitAction} onSubmit={onDone} className="flex gap-2">
          {parentId && <input type="hidden" name="parent_id" value={parentId} />}
          <input
            name="label"
            required
            placeholder={`Nombre del ${childLevelName} (ej: 1, Norte, A, PB)`}
            className="flex-1 bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
          />
          <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
            Crear
          </button>
        </form>
      )}

      {tab === "numeric" && (
        <form
          action={bulkCreateUnitsAction}
          onSubmit={onDone}
          className="grid grid-cols-1 sm:grid-cols-5 gap-2"
        >
          {parentId && <input type="hidden" name="parent_id" value={parentId} />}
          <input type="hidden" name="mode" value="numeric" />
          <input
            name="prefix"
            placeholder="Prefijo opcional"
            className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm sm:col-span-2"
          />
          <input
            type="number"
            name="from"
            required
            defaultValue="1"
            min="0"
            placeholder="Desde"
            className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
          />
          <input
            type="number"
            name="to"
            required
            defaultValue="20"
            min="1"
            max="1000"
            placeholder="Hasta"
            className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
          />
          <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
            Crear rango
          </button>
        </form>
      )}

      {tab === "letters" && (
        <form
          action={bulkCreateUnitsAction}
          onSubmit={onDone}
          className="grid grid-cols-1 sm:grid-cols-5 gap-2"
        >
          {parentId && <input type="hidden" name="parent_id" value={parentId} />}
          <input type="hidden" name="mode" value="letters" />
          <input
            name="prefix"
            placeholder="Prefijo opcional (ej: Torre)"
            className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm sm:col-span-2"
          />
          <input
            name="from_letter"
            required
            defaultValue="A"
            placeholder="Desde"
            className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm uppercase"
          />
          <input
            name="to_letter"
            required
            defaultValue="J"
            placeholder="Hasta"
            className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm uppercase"
          />
          <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
            Crear A-Z
          </button>
        </form>
      )}

      {tab === "list" && (
        <form action={bulkCreateUnitsAction} onSubmit={onDone} className="space-y-2">
          {parentId && <input type="hidden" name="parent_id" value={parentId} />}
          <input type="hidden" name="mode" value="list" />
          <input
            name="prefix"
            placeholder="Prefijo opcional aplicado a cada item"
            className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
          />
          <textarea
            name="free_list"
            required
            rows={4}
            placeholder={"Un valor por línea, o separados por coma.\nEj:\nPB\nB1\nB2\nEP\n1\n2\n3"}
            className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm font-mono"
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-zinc-500">
              Útil para PB, EP, mezcla letras/números, etc. Máximo 1000.
            </p>
            <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
              Crear todos
            </button>
          </div>
        </form>
      )}

      {tab === "special" && <SpecialPlaceForm parentId={parentId} onDone={onDone} />}
    </div>
  );
}

function SpecialPlaceForm({
  parentId,
  onDone,
}: {
  parentId: string | null;
  onDone: () => void;
}) {
  const [kind, setKind] = useState("");
  const [customKind, setCustomKind] = useState("");

  return (
    <form action={addSpecialUnitAction} onSubmit={onDone} className="space-y-3">
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      <input type="hidden" name="custom_kind" value={customKind || kind} />

      <div>
        <label className="text-xs text-zinc-400 mb-2 block">Tipo de espacio</label>
        <div className="flex flex-wrap gap-1">
          {SPECIAL_KINDS.map((s) => (
            <button
              key={s.kind}
              type="button"
              onClick={() => {
                setKind(s.kind);
                setCustomKind("");
              }}
              className={`text-xs px-3 py-1.5 rounded ${
                kind === s.kind && !customKind
                  ? "bg-violet-600 text-white font-semibold"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              }`}
            >
              {s.emoji} {s.kind}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={customKind}
          onChange={(e) => {
            setCustomKind(e.target.value);
            if (e.target.value) setKind("");
          }}
          placeholder="O escribí un tipo personalizado…"
          className="w-full mt-2 bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
        />
      </div>

      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Nombre / etiqueta</label>
        <input
          name="label"
          required
          placeholder='Ej: "Norte", "Principal", "Sector A", "Nº 1"'
          className="w-full bg-zinc-950 rounded px-3 py-2 border border-zinc-800 text-sm"
        />
      </div>

      <div className="flex justify-end">
        <button
          disabled={!kind && !customKind}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold rounded px-5 py-2 text-sm"
        >
          ✨ Crear espacio especial
        </button>
      </div>

      <p className="text-xs text-zinc-500">
        Los espacios especiales aparecen en violeta. Podés asignarles empleados (jardineros del
        club house, encargados de pileta) y los visitantes pueden tenerlos como destino.
      </p>
    </form>
  );
}
