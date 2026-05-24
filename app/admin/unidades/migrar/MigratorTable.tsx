"use client";

import { useState } from "react";
import type { LeafUnit } from "@/lib/units";
import { formatDni } from "@/lib/dni/parse";
import {
  assignLegacyGroupAction,
  clearLegacyGroupAction,
} from "./actions";

type Group = {
  unit_text: string;
  residents: Array<{ id: string; name: string; dni: string }>;
  suggestedLeafId: string | null;
};

// Una fila por cada texto legacy único. El admin decide qué hacer con cada
// grupo: asignar a una hoja existente, o marcarlo como "sin unidad".
export default function MigratorTable({
  groups,
  leaves,
}: {
  groups: Group[];
  leaves: LeafUnit[];
}) {
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <GroupRow key={g.unit_text} group={g} leaves={leaves} />
      ))}
    </div>
  );
}

function GroupRow({ group, leaves }: { group: Group; leaves: LeafUnit[] }) {
  const [selectedLeaf, setSelectedLeaf] = useState<string>(group.suggestedLeafId ?? "");
  const [q, setQ] = useState("");

  const term = q.trim().toLowerCase();
  const filtered = term
    ? leaves.filter((l) =>
        l.full_path.toLowerCase().includes(term) || l.label.toLowerCase().includes(term),
      ).slice(0, 8)
    : [];

  const chosen = leaves.find((l) => l.id === selectedLeaf);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="text-xs uppercase tracking-wider opacity-60">Texto viejo:</span>
        <span className="font-mono bg-zinc-950 px-3 py-1 rounded border border-zinc-800 font-bold">
          {group.unit_text}
        </span>
        <span className="text-xs text-zinc-400">
          → afecta a {group.residents.length} residente{group.residents.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Lista compacta de residentes afectados */}
      <div className="text-xs text-zinc-400 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
        {group.residents.slice(0, 6).map((r) => (
          <div key={r.id} className="truncate">
            • {r.name} (DNI {formatDni(r.dni)})
          </div>
        ))}
        {group.residents.length > 6 && (
          <div className="italic opacity-60">…y {group.residents.length - 6} más</div>
        )}
      </div>

      <div className="border-t border-zinc-800 pt-3 space-y-2">
        <div className="text-xs uppercase tracking-wider opacity-60 mb-1">Mapear a:</div>

        {chosen ? (
          <div className="bg-zinc-950 border border-emerald-700/40 rounded-lg p-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">
                {chosen.kind} {chosen.label}
              </div>
              {chosen.breadcrumb && (
                <div className="text-xs text-zinc-400">{chosen.breadcrumb}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedLeaf("");
                setQ("");
              }}
              className="text-xs text-zinc-400 hover:text-white underline"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar hoja del árbol (ej: 'Lote 42', 'Norte')…"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
            />
            {filtered.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg divide-y divide-zinc-800 max-h-60 overflow-y-auto shadow-lg">
                {filtered.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLeaf(l.id);
                        setQ("");
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-900"
                    >
                      <div className="text-sm font-semibold">{l.kind} {l.label}</div>
                      <div className="text-xs text-zinc-500">{l.breadcrumb}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q && filtered.length === 0 && (
              <p className="text-xs text-zinc-500 mt-1">
                Sin coincidencias.{" "}
                <a href="/admin/unidades" className="underline">
                  Creá esa unidad en el árbol primero
                </a>
                .
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end flex-wrap pt-2">
          {chosen && (
            <form action={assignLegacyGroupAction}>
              <input type="hidden" name="unit_text" value={group.unit_text} />
              <input type="hidden" name="leaf_id" value={chosen.id} />
              <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
                ✅ Aplicar a {group.residents.length} residente{group.residents.length === 1 ? "" : "s"}
              </button>
            </form>
          )}
          <form
            action={clearLegacyGroupAction}
            onSubmit={(e) => {
              if (!confirm(`¿Marcar a estos ${group.residents.length} residente(s) como "sin unidad"?`))
                e.preventDefault();
            }}
          >
            <input type="hidden" name="unit_text" value={group.unit_text} />
            <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded px-4 py-2 text-sm">
              Sin unidad
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
