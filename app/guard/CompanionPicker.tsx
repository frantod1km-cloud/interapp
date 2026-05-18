"use client";

import { useEffect, useRef, useState } from "react";
import { formatDni, parseDni } from "@/lib/dni/parse";
import { kindMeta } from "@/lib/resident-kinds";

// Modal para agregar un acompañante al ingreso. Funciona como un mini
// SearchPanel: el guardia puede escanear el DNI del acompañante con la
// pistola (input con focus), buscar en el padrón por nombre/DNI parcial,
// o tipear nuevo manualmente si no figura.
//
// Al elegir/cargar uno, se llama onAdd con sus datos y se cierra el modal.

type SearchResult = {
  kind: "resident" | "authorization";
  dni: string;
  name: string;
  detail: string;
  residentKind?: string;
};

export type Companion = {
  dni: string;
  full_name: string;
  resident_id?: string | null;
  authorization_id?: string | null;
};

export default function CompanionPicker({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (c: Companion) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualDni, setManualDni] = useState("");
  const [manualName, setManualName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Soporte para escaneo PDF417 directo en el input del buscador
  useEffect(() => {
    inputRef.current?.focus();
  }, [manualMode]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/guard/search?q=${encodeURIComponent(q.trim())}`, {
          cache: "no-store",
        });
        if (r.ok) {
          const data = await r.json();
          setResults(data.results ?? []);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter") {
      e.preventDefault();
      // Si el input contiene "@" probablemente es un scan PDF417 de pistola
      const parsed = parseDni(q);
      if (parsed && parsed.source === "scanner") {
        // Es un DNI escaneado con nombre incluido → agregar directo
        const fullName =
          parsed.firstName && parsed.lastName
            ? `${parsed.firstName} ${parsed.lastName}`
            : "Sin nombre";
        onAdd({ dni: parsed.dni, full_name: fullName });
        return;
      }
      if (results.length === 1) {
        const r = results[0];
        onAdd({ dni: r.dni, full_name: r.name });
        return;
      }
    }
  };

  const addFromSearch = (r: SearchResult) => {
    onAdd({ dni: r.dni, full_name: r.name });
  };

  const addManual = () => {
    const dni = manualDni.replace(/\D/g, "");
    const name = manualName.trim();
    if (!dni || dni.length < 7) {
      alert("DNI inválido");
      return;
    }
    if (!name) {
      alert("Cargá el nombre");
      return;
    }
    onAdd({ dni, full_name: name });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 sm:p-12"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Agregar acompañante</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-sm px-2"
            aria-label="Cerrar"
          >
            ✕ Esc
          </button>
        </div>

        {!manualMode && (
          <>
            <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
              <span className="text-xl">🔍</span>
              <input
                ref={inputRef}
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Escaneá el DNI o buscá por nombre, apellido, DNI…"
                autoFocus
                autoComplete="off"
                className="flex-1 outline-none text-lg bg-transparent text-white placeholder:text-zinc-500"
              />
            </div>
            <div className="max-h-[40vh] overflow-y-auto">
              {q.trim().length < 2 && (
                <p className="p-6 text-center text-zinc-500 text-sm">
                  Tipeá al menos 2 caracteres, o usá la pistola para escanear el DNI directamente.
                </p>
              )}
              {loading && q.trim().length >= 2 && (
                <p className="p-6 text-center text-zinc-500 text-sm">Buscando…</p>
              )}
              {!loading && q.trim().length >= 2 && results.length === 0 && (
                <p className="p-6 text-center text-zinc-500 text-sm">
                  Sin resultados en el padrón.
                </p>
              )}
              {results.map((r) => {
                const km = r.residentKind ? kindMeta(r.residentKind) : null;
                return (
                  <button
                    key={`${r.kind}-${r.dni}-${r.name}`}
                    type="button"
                    onClick={() => addFromSearch(r)}
                    className="w-full text-left p-3 border-b border-zinc-800 last:border-0 hover:bg-zinc-800 transition flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-base flex-shrink-0">
                      {km ? km.emoji : r.kind === "authorization" ? "✋" : "👤"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-zinc-400">
                        DNI {formatDni(r.dni)} · {r.detail}
                      </div>
                    </div>
                    <span className="text-emerald-400 text-sm font-medium">Agregar →</span>
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-zinc-800 bg-zinc-950">
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="w-full text-sm text-zinc-400 hover:text-white py-2"
              >
                ✏️ Cargar nuevo visitante (no está en el padrón)
              </button>
            </div>
          </>
        )}

        {manualMode && (
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">DNI</label>
              <input
                type="text"
                inputMode="numeric"
                value={manualDni}
                onChange={(e) => setManualDni(e.target.value)}
                autoFocus
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nombre y apellido</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setManualMode(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-2 rounded-lg text-sm"
              >
                ← Volver al buscador
              </button>
              <button
                type="button"
                onClick={addManual}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-semibold py-2 rounded-lg text-sm"
              >
                Agregar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
