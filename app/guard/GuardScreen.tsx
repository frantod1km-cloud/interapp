"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { formatDni } from "@/lib/dni/parse";
import { scanAction, registerAccessAction, type ScanResponse } from "./actions";
import type { LookupResult } from "@/lib/access/lookup";

type Screen =
  | { kind: "idle" }
  | { kind: "checking"; raw: string }
  | { kind: "result"; result: LookupResult; scannedName?: string }
  | { kind: "confirmed"; message: string }
  | { kind: "error"; message: string };

const RESULT_TIMEOUT_MS = 30_000; // si el guardia no decide en 30s, vuelve a idle
const CONFIRMED_TIMEOUT_MS = 1500;

export default function GuardScreen({ orgName }: { orgName: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  // Mantener focus permanente en el input
  const refocus = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    refocus();
    const onClick = () => refocus();
    const onVisibility = () => refocus();
    window.addEventListener("click", onClick);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refocus]);

  // Auto-volver a idle si pasa mucho tiempo en confirmed/result sin acción
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

  const submit = (raw: string) => {
    if (!raw.trim()) return;
    setValue("");
    setScreen({ kind: "checking", raw });
    startTransition(async () => {
      const resp: ScanResponse = await scanAction(raw);
      if (!resp.ok) {
        setScreen({ kind: "error", message: resp.error });
        refocus();
        return;
      }
      const scannedName =
        resp.parsed.firstName && resp.parsed.lastName
          ? `${resp.parsed.firstName} ${resp.parsed.lastName}`
          : undefined;
      setScreen({ kind: "result", result: resp.result, scannedName });
      refocus();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit(value);
    }
  };

  const register = (opts: {
    result: "authorized" | "forced" | "manual";
    reason?: string;
  }) => {
    if (screen.kind !== "result") return;
    const r = screen.result;
    const fullName =
      r.state === "authorized" || r.state === "expired"
        ? r.fullName ?? screen.scannedName
        : screen.scannedName;

    startTransition(async () => {
      const resp = await registerAccessAction({
        dni: r.dni,
        fullName,
        direction: "in",
        result: opts.result,
        reason: opts.reason,
        authorizationId:
          (r.state === "authorized" && r.kind === "authorization" && r.authorizationId) ||
          (r.state === "expired" && r.authorizationId) ||
          undefined,
        residentId:
          (r.state === "authorized" && r.kind === "resident" && r.residentId) || undefined,
      });
      if (!resp.ok) {
        setScreen({ kind: "error", message: resp.error || "Error registrando ingreso." });
        return;
      }
      const time = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      setScreen({ kind: "confirmed", message: `Ingreso registrado · ${time}` });
    });
  };

  const bgClass =
    screen.kind === "result"
      ? screen.result.state === "authorized"
        ? "bg-emerald-600"
        : screen.result.state === "expired"
          ? "bg-amber-500"
          : "bg-amber-500"
      : screen.kind === "confirmed"
        ? "bg-emerald-700"
        : screen.kind === "error"
          ? "bg-rose-700"
          : "bg-zinc-950";

  return (
    <main className={`min-h-screen transition-colors duration-150 ${bgClass} text-white`}>
      {/* Input invisible siempre con focus */}
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

      <header className="flex items-center justify-between px-6 py-4 bg-black/30">
        <div className="font-semibold">{orgName}</div>
        <div className="text-sm opacity-70">Control de Acceso</div>
      </header>

      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-72px)] px-6 text-center">
        {screen.kind === "idle" && <IdleView />}
        {screen.kind === "checking" && <CheckingView raw={screen.raw} />}
        {screen.kind === "result" && (
          <ResultView
            result={screen.result}
            scannedName={screen.scannedName}
            onRegister={register}
            isPending={isPending}
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
  onRegister,
  isPending,
}: {
  result: LookupResult;
  scannedName?: string;
  onRegister: (opts: { result: "authorized" | "forced" | "manual"; reason?: string }) => void;
  isPending: boolean;
}) {
  const dniDisplay = formatDni(result.dni);

  if (result.state === "authorized") {
    return (
      <div className="max-w-2xl">
        <div className="text-8xl mb-4">✅</div>
        <h1 className="text-5xl font-bold mb-2">AUTORIZADO</h1>
        <p className="text-3xl font-semibold mb-1">{result.fullName}</p>
        <p className="text-xl opacity-90 mb-1">DNI {dniDisplay}</p>
        <p className="text-lg opacity-80 mb-8">{result.detail}</p>
        <button
          onClick={() => onRegister({ result: "authorized" })}
          disabled={isPending}
          className="bg-white text-emerald-700 font-bold text-2xl px-10 py-5 rounded-2xl shadow-lg active:scale-95 transition disabled:opacity-50"
        >
          {isPending ? "Registrando…" : "Registrar ingreso"}
        </button>
      </div>
    );
  }

  // expired o unknown → amarillo, opciones para forzar o cancelar
  const headline = result.state === "expired" ? "AUTORIZACIÓN VENCIDA" : "DNI NO REGISTRADO";
  return (
    <div className="max-w-2xl">
      <div className="text-8xl mb-4">⚠️</div>
      <h1 className="text-4xl font-bold mb-2">{headline}</h1>
      {(result.state === "expired" && result.fullName) || scannedName ? (
        <p className="text-2xl font-semibold mb-1">
          {result.state === "expired" ? result.fullName : scannedName}
        </p>
      ) : null}
      <p className="text-xl opacity-90 mb-1">DNI {dniDisplay}</p>
      <p className="text-lg opacity-80 mb-8">{result.detail}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 justify-center">
        <button
          onClick={() => onRegister({ result: "forced", reason: "Forzado por guardia" })}
          disabled={isPending}
          className="bg-white text-amber-700 font-bold text-xl px-8 py-4 rounded-2xl shadow active:scale-95 transition disabled:opacity-50"
        >
          Forzar ingreso
        </button>
        <button
          onClick={() => onRegister({ result: "manual", reason: "Rechazado" })}
          disabled={isPending}
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
