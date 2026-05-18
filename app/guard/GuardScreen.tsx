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
  const [showSearch, setShowSearch] = useState(false);

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
      r.state === "authorized" ||
      r.state === "expired" ||
      r.state === "out_of_window" ||
      r.state === "access_expired"
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
        (r.state === "access_expired" && r.residentId) ||
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
          : screen.result.state === "access_expired"
            ? "bg-rose-700"
            : "bg-amber-500"
      : screen.kind === "confirmed"
        ? "bg-emerald-700"
        : screen.kind === "error"
          ? "bg-rose-700"
          : "bg-zinc-950";

  const isColored = screen.kind !== "idle" && screen.kind !== "checking";
  const textColor = isColored ? "text-white" : "text-white";

  return (
    <main className={`min-h-screen transition-colors duration-150 ${bgClass} ${textColor}`}>
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

      {showSearch && (
        <SearchPanel
          onClose={() => {
            setShowSearch(false);
            refocus();
          }}
          onPick={(dni) => {
            setShowSearch(false);
            submit(dni);
          }}
        />
      )}

      <header className={`flex items-center justify-between px-6 py-3 text-sm gap-3 flex-wrap ${
        isColored ? "bg-black/30" : "bg-zinc-950 border-b border-zinc-800"
      }`}>
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
        <div className={`flex rounded-lg p-0.5 ${isColored ? "bg-black/40" : "bg-zinc-700"}`}>
          <button
            type="button"
            onClick={() => setDirection("in")}
            className={`px-3 py-1 rounded text-xs font-bold transition ${
              direction === "in"
                ? "bg-emerald-500 text-white shadow"
                : isColored
                  ? "opacity-60 hover:opacity-100"
                  : "text-zinc-400 hover:text-white"
            }`}
          >
            ↘ ENTRADA
          </button>
          <button
            type="button"
            onClick={() => setDirection("out")}
            className={`px-3 py-1 rounded text-xs font-bold transition ${
              direction === "out"
                ? "bg-sky-500 text-white shadow"
                : isColored
                  ? "opacity-60 hover:opacity-100"
                  : "text-zinc-400 hover:text-white"
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
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className={`text-xs flex items-center gap-1 ${
              isColored
                ? "opacity-60 hover:opacity-100"
                : "px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
            }`}
          >
            🔍 Buscar
          </button>
          <a href="/guard/package" className="text-xs opacity-60 hover:opacity-100">
            📦 Paquetes
          </a>
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

type DashboardStats = {
  ingressesToday: number;
  pendingPackages: number;
  reservationsToday: number;
  activeAuths: number;
};

function IdleView() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const r = await fetch("/api/guard/dashboard", { cache: "no-store" });
        if (r.ok) setStats(await r.json());
      } catch {
        // ignoramos errores, mostramos sin stats
      }
    };
    fetchStats();
    const t = setInterval(fetchStats, 60_000); // refrescar cada minuto
    return () => clearInterval(t);
  }, []);

  return (
    <div className="w-full max-w-3xl">
      <div className="text-center mb-10">
        <div className="text-7xl mb-6">📷</div>
        <h1 className="text-4xl font-bold mb-3">Escaneá el DNI</h1>
        <p className="text-xl text-zinc-400">o tipeá el número y presioná Enter</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <IdleStat label="Ingresos hoy" value={stats.ingressesToday} icon="🚪" />
          <IdleStat
            label="Paquetes esperando"
            value={stats.pendingPackages}
            icon="📦"
            href={stats.pendingPackages > 0 ? "/guard/package" : undefined}
            highlight={stats.pendingPackages > 0}
          />
          <IdleStat
            label="Reservas hoy"
            value={stats.reservationsToday}
            icon="🛒"
            highlight={stats.reservationsToday > 0}
          />
          <IdleStat label="Visitas vigentes" value={stats.activeAuths} icon="✋" />
        </div>
      )}
    </div>
  );
}

function IdleStat({
  label,
  value,
  icon,
  href,
  highlight,
}: {
  label: string;
  value: number;
  icon: string;
  href?: string;
  highlight?: boolean;
}) {
  const content = (
    <div
      className={`rounded-xl p-4 text-left transition ${
        highlight
          ? "bg-sky-600/20 border border-sky-500/40 hover:bg-blue-100 text-sky-300"
          : "bg-zinc-900 border border-zinc-800 text-white"
      } ${href ? "hover:scale-[1.02] cursor-pointer" : ""}`}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-400 mt-1">{label}</div>
    </div>
  );
  return href ? <a href={href}>{content}</a> : content;
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-950/20 mb-3 text-sm font-bold">
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
        {result.pendingPackages && result.pendingPackages > 0 ? (
          <div className="bg-sky-600 rounded-xl px-4 py-3 mb-3 inline-flex items-center gap-3 text-left text-white font-bold">
            <span className="text-2xl">📦</span>
            <span>
              Tiene {result.pendingPackages} paquete{result.pendingPackages > 1 ? "s" : ""} esperando.{" "}
              <a href="/guard/package" className="underline opacity-90 hover:opacity-100">
                Ir a entregar
              </a>
            </span>
          </div>
        ) : null}

        {result.reservations && result.reservations.length > 0 ? (
          <div className="bg-violet-600 rounded-xl px-4 py-3 mb-3 inline-block text-left text-white">
            <div className="font-bold flex items-center gap-2 mb-1">
              <span className="text-xl">🛒</span> Reservas hoy
            </div>
            <div className="space-y-1 text-sm">
              {result.reservations.map((r) => {
                const start = new Date(r.starts_at);
                const end = new Date(r.ends_at);
                const same = start.toDateString() === end.toDateString();
                return (
                  <div key={r.id} className="font-semibold">
                    {r.listing_kind === "event" ? "🎉" : "🏛️"} {r.listing_name} ·{" "}
                    {start.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    {same &&
                      ` a ${end.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`}
                    {r.status === "pending_payment" && (
                      <span className="ml-2 text-xs bg-amber-300 text-amber-900 px-1.5 py-0.5 rounded font-normal">
                        sin pagar
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {result.lastEvent && (
          <div className="text-xs opacity-70 mt-2">
            Última {result.lastEvent.direction === "in" ? "entrada" : "salida"}:{" "}
            {formatLastSeen(result.lastEvent.occurred_at)}
          </div>
        )}
        {offline && <p className="text-xs opacity-70 mb-4">(offline · padrón local)</p>}
        <div>
          <button
            onClick={() => onRegister({ result: "authorized" })}
            disabled={busy}
            className="bg-zinc-950 text-emerald-400 font-bold text-2xl px-10 py-5 rounded-2xl shadow-lg active:scale-95 transition disabled:opacity-50"
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
        : result.state === "access_expired"
          ? "ACCESO VENCIDO"
          : "DNI NO REGISTRADO";

  const displayName =
    result.state === "expired" ||
    result.state === "out_of_window" ||
    result.state === "access_expired"
      ? result.fullName
      : scannedName;

  const km =
    result.state === "out_of_window" || result.state === "access_expired"
      ? kindMeta(result.residentKind)
      : null;

  return (
    <div className="max-w-2xl">
      <div className="text-8xl mb-4">⚠️</div>
      <h1 className="text-4xl font-bold mb-2">{headline}</h1>
      {km && (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-950/20 mb-3 text-sm font-bold">
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
                  : result.state === "access_expired"
                    ? "Acceso vencido"
                    : "Forzado por guardia",
            })
          }
          disabled={busy}
          className="bg-zinc-950 text-amber-300 font-bold text-xl px-8 py-4 rounded-2xl shadow active:scale-95 transition disabled:opacity-50"
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
        className="bg-zinc-950 text-rose-300 font-bold text-lg px-6 py-3 rounded-xl"
      >
        Reintentar
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchPanel — Modal para buscar personas por nombre o DNI parcial cuando
// el escáner no sirve (DNI roto, extranjero, querer ver ficha sin tener a la
// persona presente).
// ---------------------------------------------------------------------------
type SearchResult = {
  kind: "resident" | "authorization";
  dni: string;
  name: string;
  detail: string;
  residentKind?: string;
};

function SearchPanel({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (dni: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (e.key === "Enter" && results.length === 1) {
      e.preventDefault();
      onPick(results[0].dni);
    }
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
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
          <span className="text-xl">🔍</span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar por nombre, apellido, DNI o lote…"
            autoFocus
            autoComplete="off"
            className="flex-1 outline-none text-lg bg-transparent text-white placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-sm px-2"
            aria-label="Cerrar"
          >
            ✕ Esc
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length < 2 && (
            <p className="p-6 text-center text-zinc-500 text-sm">
              Tipeá al menos 2 caracteres. Podés buscar por nombre, apellido, DNI parcial o lote.
            </p>
          )}
          {loading && q.trim().length >= 2 && (
            <p className="p-6 text-center text-zinc-500 text-sm">Buscando…</p>
          )}
          {!loading && q.trim().length >= 2 && results.length === 0 && (
            <p className="p-6 text-center text-zinc-500 text-sm">Sin resultados.</p>
          )}
          {results.map((r) => {
            const km = r.residentKind ? kindMeta(r.residentKind) : null;
            return (
              <button
                key={`${r.kind}-${r.dni}-${r.name}`}
                type="button"
                onClick={() => onPick(r.dni)}
                className="w-full text-left p-4 border-b border-zinc-100 last:border-0 hover:bg-blue-50 transition flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-xl flex-shrink-0">
                  {km ? km.emoji : r.kind === "authorization" ? "✋" : "👤"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white">{r.name}</div>
                  <div className="text-sm text-zinc-400">
                    DNI {formatDni(r.dni)} · {r.detail}
                  </div>
                </div>
                <span className="text-emerald-400 text-sm font-medium">Ver ficha →</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Formatea una fecha ISO como tiempo legible: "hoy 14:30", "ayer 22:00",
// "lun 12/05 10:00", etc.
function formatLastSeen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isSameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  if (isSameDay) return `hoy ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return `ayer ${time}`;
  }
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
