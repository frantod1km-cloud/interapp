"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDni, parseDni } from "@/lib/dni/parse";
import type { LookupResult } from "@/lib/access/lookup";
import { kindMeta } from "@/lib/resident-kinds";
import {
  enqueue,
  listQueue,
  loadSnapshot,
  removeFromQueue,
  saveSnapshot,
  type QueuedEvent,
  type Snapshot,
} from "@/lib/offline/db";
import { lookupDniOffline } from "@/lib/offline/lookup";

type Screen =
  | { kind: "idle" }
  | { kind: "checking"; raw: string }
  | { kind: "result"; result: LookupResult; scannedName?: string; offline: boolean }
  | { kind: "confirmed"; message: string }
  | { kind: "error"; message: string };

const RESULT_TIMEOUT_MS = 30_000;
const CONFIRMED_TIMEOUT_MS = 1500;
const SNAPSHOT_REFRESH_MS = 5 * 60_000; // refrescar padrón cada 5 minutos si hay net

function uuid() {
  return crypto.randomUUID();
}

type Gate = { id: string; name: string };

const GATE_LS_KEY = "interapp.guard.gate";

export default function GuardScreen({
  orgName,
  gates,
  isLead,
}: {
  orgName: string;
  gates: Gate[];
  isLead: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(0);
  const [snapshotAge, setSnapshotAge] = useState<string | null>(null);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [gateId, setGateId] = useState<string | null>(null);
  const [showGatePicker, setShowGatePicker] = useState(false);

  const currentGate = gates.find((g) => g.id === gateId) ?? null;

  // Cargar gate persistida en este dispositivo
  useEffect(() => {
    if (gates.length === 0) return;
    const saved = localStorage.getItem(GATE_LS_KEY);
    if (saved && gates.some((g) => g.id === saved)) {
      setGateId(saved);
    } else if (gates.length === 1) {
      // Si hay una sola garita, la asignamos sin preguntar
      setGateId(gates[0].id);
      localStorage.setItem(GATE_LS_KEY, gates[0].id);
    } else {
      // Hay múltiples y no eligió todavía → mostrar selector
      setShowGatePicker(true);
    }
  }, [gates]);

  const chooseGate = (id: string) => {
    setGateId(id);
    localStorage.setItem(GATE_LS_KEY, id);
    setShowGatePicker(false);
  };

  // --- focus permanente ---
  const refocus = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    refocus();
    const onClick = () => refocus();
    const onVisibility = () => refocus();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("click", onClick);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refocus]);

  // --- SW + snapshot inicial + refresh periódico ---
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const refreshSnapshot = async () => {
      try {
        const resp = await fetch("/api/guard/snapshot", { cache: "no-store" });
        if (!resp.ok) return;
        const snap = (await resp.json()) as Snapshot;
        await saveSnapshot(snap);
        setSnapshotAge(snap.fetched_at);
      } catch {
        // ignoramos errores de red, mantenemos snapshot viejo
      }
    };

    const loadInitial = async () => {
      const existing = await loadSnapshot();
      if (existing) setSnapshotAge(existing.fetched_at);
      const q = await listQueue();
      setQueueSize(q.length);
    };

    loadInitial();
    refreshSnapshot();
    const t = setInterval(refreshSnapshot, SNAPSHOT_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // --- flush automático cuando vuelve internet ---
  const flushQueue = useCallback(async () => {
    const q = await listQueue();
    if (q.length === 0) {
      setQueueSize(0);
      return;
    }
    try {
      const resp = await fetch("/api/guard/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: q }),
      });
      if (!resp.ok) return;
      const { confirmed } = (await resp.json()) as { confirmed: string[] };
      await Promise.all(confirmed.map(removeFromQueue));
      const remaining = await listQueue();
      setQueueSize(remaining.length);
    } catch {
      // sigue offline, reintentamos después
    }
  }, []);

  useEffect(() => {
    if (online) flushQueue();
    const t = setInterval(() => {
      if (navigator.onLine) flushQueue();
    }, 15_000);
    return () => clearInterval(t);
  }, [online, flushQueue]);

  // --- auto vuelta a idle ---
  useEffect(() => {
    if (screen.kind === "confirmed") {
      const t = setTimeout(() => {
        setScreen({ kind: "idle" });
        refocus();
      }, CONFIRMED_TIMEOUT_MS);
      return () => clearTimeout(t);
    }
    if (screen.kind === "result") {
      const t = setTimeout(() => {
        setScreen({ kind: "idle" });
        refocus();
      }, RESULT_TIMEOUT_MS);
      return () => clearTimeout(t);
    }
  }, [screen, refocus]);

  // --- scan ---
  const submit = async (raw: string) => {
    if (!raw.trim() || busy) return;
    setValue("");
    setBusy(true);
    setScreen({ kind: "checking", raw });

    const parsed = parseDni(raw);
    if (!parsed) {
      setScreen({ kind: "error", message: "No se pudo leer el DNI." });
      setBusy(false);
      refocus();
      return;
    }
    const scannedName =
      parsed.firstName && parsed.lastName ? `${parsed.firstName} ${parsed.lastName}` : undefined;

    // Si hay internet: query al server (datos siempre frescos)
    if (navigator.onLine) {
      try {
        const resp = await fetch(
          `/api/guard/lookup?dni=${encodeURIComponent(parsed.dni)}`,
          { cache: "no-store" },
        );
        if (resp.ok) {
          const result = (await resp.json()) as LookupResult;
          setScreen({ kind: "result", result, scannedName, offline: false });
          setBusy(false);
          refocus();
          return;
        }
      } catch {
        // cae al fallback offline
      }
    }

    // Offline o fallo de red: lookup contra snapshot local
    const snap = await loadSnapshot();
    if (!snap) {
      setScreen({
        kind: "error",
        message: "Sin conexión y sin padrón cacheado. Conectate al menos una vez para descargarlo.",
      });
      setBusy(false);
      refocus();
      return;
    }
    const result = lookupDniOffline(snap, parsed.dni);
    setScreen({ kind: "result", result, scannedName, offline: true });
    setBusy(false);
    refocus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit(value);
    }
  };

  // --- registro de evento ---
  const register = async (opts: {
    result: "authorized" | "forced" | "manual";
    reason?: string;
  }) => {
    if (screen.kind !== "result" || busy) return;
    setBusy(true);
    const r = screen.result;
    const fullName =
      r.state === "authorized" || r.state === "expired" || r.state === "out_of_window"
        ? r.fullName ?? screen.scannedName
        : screen.scannedName;

    const event: QueuedEvent = {
      client_id: uuid(),
      dni: r.dni,
      full_name: fullName ?? null,
      direction,
      result: opts.result,
      reason: opts.reason ?? null,
      authorization_id:
        (r.state === "authorized" && r.kind === "authorization" && r.authorizationId) ||
        (r.state === "expired" && r.authorizationId) ||
        null,
      resident_id:
        (r.state === "authorized" && r.kind === "resident" && r.residentId) ||
        (r.state === "out_of_window" && r.residentId) ||
        null,
      occurred_at: new Date().toISOString(),
      gate_id: gateId,
      gate_label: currentGate?.name ?? null,
    };

    // Estrategia: siempre encolar primero (durabilidad), después intentar flush.
    await enqueue(event);
    setQueueSize((n) => n + 1);

    if (navigator.onLine) {
      await flushQueue();
    }

    const time = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    const verb = direction === "in" ? "Entrada" : "Salida";
    setScreen({
      kind: "confirmed",
      message: navigator.onLine
        ? `${verb} registrada · ${time}`
        : `${verb} guardada (offline) · ${time}`,
    });
    setBusy(false);
  };

  const bgClass =
    screen.kind === "result"
      ? screen.result.state === "authorized"
        ? "bg-emerald-600"
        : screen.result.state === "out_of_window"
          ? "bg-orange-600"
          : "bg-amber-500"
      : screen.kind === "confirmed"
        ? "bg-emerald-700"
        : screen.kind === "error"
          ? "bg-rose-700"
          : "bg-zinc-950";

  return (
    <main className={`min-h-screen transition-colors duration-150 ${bgClass} text-white`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={refocus}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        className="sr-only"
        aria-label="Escaneá el DNI"
      />

      {showGatePicker && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-2">¿En qué garita estás?</h2>
            <p className="text-zinc-400 text-sm mb-6">
              Esto identifica a esta tablet. Solo se elige una vez por dispositivo.
            </p>
            <div className="grid gap-2">
              {gates.map((g) => (
                <button
                  key={g.id}
                  onClick={() => chooseGate(g.id)}
                  className="bg-zinc-800 hover:bg-emerald-600 font-semibold py-4 rounded-xl text-left px-4"
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <header className="flex items-center justify-between px-6 py-3 bg-black/30 text-sm gap-3 flex-wrap">
        <div className="font-semibold">
          {orgName}
          {currentGate && (
            <button
              onClick={() => setShowGatePicker(true)}
              className="ml-2 text-xs px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 font-normal opacity-80"
            >
              📍 {currentGate.name}
            </button>
          )}
        </div>

        {/* Toggle dirección — el guardia lo cambia para registrar entradas vs salidas */}
        <div className="flex bg-black/40 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setDirection("in")}
            className={`px-3 py-1 rounded text-xs font-bold transition ${
              direction === "in" ? "bg-emerald-500 text-black" : "opacity-60 hover:opacity-100"
            }`}
          >
            ↘ ENTRADA
          </button>
          <button
            type="button"
            onClick={() => setDirection("out")}
            className={`px-3 py-1 rounded text-xs font-bold transition ${
              direction === "out" ? "bg-sky-500 text-black" : "opacity-60 hover:opacity-100"
            }`}
          >
            ↗ SALIDA
          </button>
        </div>

        <div className="flex items-center gap-3 opacity-80 ml-auto">
          {!online && <span className="bg-amber-500 text-black px-2 py-0.5 rounded text-xs font-bold">SIN CONEXIÓN</span>}
          {queueSize > 0 && (
            <span className="bg-zinc-800 px-2 py-0.5 rounded text-xs">
              {queueSize} en cola
            </span>
          )}
          {snapshotAge && (
            <span className="text-xs opacity-60">
              Padrón: {new Date(snapshotAge).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {isLead && (
            <a href="/guard/supervision" className="text-xs opacity-60 hover:opacity-100">
              Supervisión
            </a>
          )}
          <form action="/api/logout" method="post">
            <button className="text-xs opacity-60 hover:opacity-100">Salir</button>
          </form>
        </div>
      </header>

      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6 text-center">
        {screen.kind === "idle" && <IdleView />}
        {screen.kind === "checking" && <CheckingView raw={screen.raw} />}
        {screen.kind === "result" && (
          <ResultView
            result={screen.result}
            scannedName={screen.scannedName}
            offline={screen.offline}
            direction={direction}
            onRegister={register}
            busy={busy}
          />
        )}
        {screen.kind === "confirmed" && <ConfirmedView message={screen.message} />}
        {screen.kind === "error" && (
          <ErrorView
            message={screen.message}
            onDismiss={() => {
              setScreen({ kind: "idle" });
              refocus();
            }}
          />
        )}
      </div>
    </main>
  );
}

function IdleView() {
  return (
    <div>
      <div className="text-7xl mb-6">📷</div>
      <h1 className="text-4xl font-bold mb-3">Escaneá el DNI</h1>
      <p className="text-xl text-zinc-400">o tipeá el número y presioná Enter</p>
    </div>
  );
}

function CheckingView({ raw }: { raw: string }) {
  return (
    <div>
      <div className="text-6xl mb-4 animate-pulse">⏳</div>
      <h1 className="text-3xl font-bold mb-2">Verificando…</h1>
      <p className="text-zinc-400 text-sm break-all max-w-md">{raw.slice(0, 80)}</p>
    </div>
  );
}

function ResultView({
  result,
  scannedName,
  offline,
  direction,
  onRegister,
  busy,
}: {
  result: LookupResult;
  scannedName?: string;
  offline: boolean;
  direction: "in" | "out";
  onRegister: (opts: { result: "authorized" | "forced" | "manual"; reason?: string }) => void;
  busy: boolean;
}) {
  const dniDisplay = formatDni(result.dni);
  const actionLabel = direction === "in" ? "Registrar entrada" : "Registrar salida";

  if (result.state === "authorized") {
    const vehicles = result.vehicles ?? [];
    const km = result.kind === "resident" && result.residentKind ? kindMeta(result.residentKind) : null;
    return (
      <div className="max-w-2xl">
        <div className="text-8xl mb-4">✅</div>
        <h1 className="text-5xl font-bold mb-2">AUTORIZADO</h1>
        {km && (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 mb-3 text-sm font-bold">
            {km.emoji} {km.label}
          </div>
        )}
        <p className="text-3xl font-semibold mb-1">{result.fullName}</p>
        <p className="text-xl opacity-90 mb-1">DNI {dniDisplay}</p>
        <p className="text-lg opacity-80 mb-3">{result.detail}</p>
        {vehicles.length > 0 && (
          <div className="bg-black/30 rounded-xl px-4 py-3 mb-4 inline-block text-left">
            <div className="text-xs uppercase tracking-wider opacity-70 mb-1">Vehículos</div>
            {vehicles.map((v) => (
              <div key={v.plate} className="font-mono font-bold text-lg">
                {v.plate}
                {(v.make || v.model || v.color) && (
                  <span className="font-sans font-normal text-sm opacity-80 ml-2">
                    {[v.make, v.model, v.color].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {offline && <p className="text-xs opacity-70 mb-4">(offline · padrón local)</p>}
        <div>
          <button
            onClick={() => onRegister({ result: "authorized" })}
            disabled={busy}
            className="bg-white text-emerald-700 font-bold text-2xl px-10 py-5 rounded-2xl shadow-lg active:scale-95 transition disabled:opacity-50"
          >
            {busy ? "Registrando…" : actionLabel}
          </button>
        </div>
      </div>
    );
  }

  const headline =
    result.state === "expired"
      ? "AUTORIZACIÓN VENCIDA"
      : result.state === "out_of_window"
        ? "FUERA DE HORARIO HABITUAL"
        : "DNI NO REGISTRADO";

  const displayName =
    result.state === "expired" || result.state === "out_of_window"
      ? result.fullName
      : scannedName;

  const km = result.state === "out_of_window" ? kindMeta(result.residentKind) : null;

  return (
    <div className="max-w-2xl">
      <div className="text-8xl mb-4">⚠️</div>
      <h1 className="text-4xl font-bold mb-2">{headline}</h1>
      {km && (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 mb-3 text-sm font-bold">
          {km.emoji} {km.label}
        </div>
      )}
      {displayName && <p className="text-2xl font-semibold mb-1">{displayName}</p>}
      <p className="text-xl opacity-90 mb-1">DNI {dniDisplay}</p>
      <p className="text-lg opacity-80 mb-6">{result.detail}</p>
      {offline && <p className="text-xs opacity-70 mb-4">(offline · padrón local)</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 justify-center">
        <button
          onClick={() =>
            onRegister({
              result: "forced",
              reason:
                result.state === "out_of_window"
                  ? "Fuera de horario habitual"
                  : "Forzado por guardia",
            })
          }
          disabled={busy}
          className="bg-white text-amber-700 font-bold text-xl px-8 py-4 rounded-2xl shadow active:scale-95 transition disabled:opacity-50"
        >
          Forzar {direction === "in" ? "entrada" : "salida"}
        </button>
        <button
          onClick={() => onRegister({ result: "manual", reason: "Rechazado" })}
          disabled={busy}
          className="bg-rose-700 text-white font-bold text-xl px-8 py-4 rounded-2xl shadow active:scale-95 transition disabled:opacity-50"
        >
          Rechazar
        </button>
      </div>
    </div>
  );
}

function ConfirmedView({ message }: { message: string }) {
  return (
    <div>
      <div className="text-9xl mb-4">✓</div>
      <h1 className="text-4xl font-bold">{message}</h1>
    </div>
  );
}

function ErrorView({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="max-w-lg">
      <div className="text-7xl mb-4">⛔</div>
      <h1 className="text-3xl font-bold mb-2">Error</h1>
      <p className="text-xl mb-6 opacity-90">{message}</p>
      <button
        onClick={onDismiss}
        className="bg-white text-rose-700 font-bold text-lg px-6 py-3 rounded-xl"
      >
        Reintentar
      </button>
    </div>
  );
}
