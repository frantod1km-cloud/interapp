"use client";

import { useState, useTransition } from "react";
import {
  generatePickupPinAction,
  revokePickupPinAction,
} from "@/app/admin/packages/actions";

// Botón en cada paquete pendiente del residente para autorizar a un tercero
// a retirar generando un PIN de 6 dígitos. Si ya hay un PIN generado, se
// muestra y se ofrece compartir por WhatsApp o revocar.

export default function PinButton({
  packageId,
  description,
  orgName,
  existingPin,
  holderName,
}: {
  packageId: string;
  description: string;
  orgName: string;
  existingPin: string | null;
  holderName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState<string | null>(existingPin);
  const [holder, setHolder] = useState(holderName ?? "");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("package_id", packageId);
      if (holder.trim()) fd.append("holder", holder.trim());
      const r = await generatePickupPinAction(fd);
      if ("error" in r) {
        setError(r.error);
      } else {
        setPin(r.pin);
      }
    });
  };

  const revoke = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("package_id", packageId);
      await revokePickupPinAction(fd);
      setPin(null);
      setOpen(false);
    });
  };

  const copyPin = async () => {
    if (!pin) return;
    await navigator.clipboard.writeText(pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const whatsappUrl = pin
    ? `https://wa.me/?text=${encodeURIComponent(
        `Te dejé un paquete autorizado en la garita de ${orgName}.\n\nDescripción: ${description}\nPIN para retirar: ${pin}\n\nMostralo en la garita.`,
      )}`
    : "#";

  if (!open && !pin) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded"
      >
        🔑 Que lo retire otro
      </button>
    );
  }

  if (pin) {
    return (
      <div className="bg-zinc-950 border border-emerald-700/40 rounded-lg p-3 mt-2 space-y-2">
        <div className="text-xs text-zinc-400">PIN para retirar:</div>
        <div className="font-mono text-2xl font-bold tracking-widest text-center bg-zinc-900 border border-zinc-800 rounded py-2">
          {pin}
        </div>
        {holderName && (
          <div className="text-xs text-zinc-400 text-center">Para: {holderName}</div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={copyPin}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 py-2 rounded"
          >
            {copied ? "✓ Copiado" : "Copiar PIN"}
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-emerald-700 hover:bg-emerald-600 py-2 rounded text-center"
          >
            Enviar por WhatsApp
          </a>
        </div>
        <button
          type="button"
          onClick={revoke}
          disabled={busy}
          className="w-full text-xs text-rose-300 hover:text-rose-300 py-1 disabled:opacity-50"
        >
          Cancelar PIN
        </button>
      </div>
    );
  }

  // open && !pin → form para generar
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 mt-2 space-y-2">
      <input
        type="text"
        value={holder}
        onChange={(e) => setHolder(e.target.value)}
        placeholder="Nombre de quien va a retirar (opcional)"
        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
      />
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs bg-zinc-800 hover:bg-zinc-700 py-2 rounded"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="text-xs bg-emerald-600 hover:bg-emerald-500 py-2 rounded font-semibold disabled:opacity-50"
        >
          {busy ? "Generando…" : "Generar PIN"}
        </button>
      </div>
    </div>
  );
}
