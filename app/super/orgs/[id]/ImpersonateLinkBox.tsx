"use client";

import { useState } from "react";

// Muestra el magic link generado para impersonar al org_admin, con botones
// para copiar o abrir en pestaña nueva. El link es de un solo uso y expira
// en ~1 hora (default de Supabase Auth).
export default function ImpersonateLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: seleccionar el input
    }
  };

  return (
    <div className="bg-sky-950/40 border border-sky-700/50 rounded-2xl p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sky-200">🔑 Link para impersonar</h3>
        <p className="text-xs text-sky-300/80 mt-1">
          Un solo uso. Expira en ~1 hora. Copiá el link o abrilo en una pestaña incógnito para
          entrar como el org_admin del barrio.
        </p>
      </div>
      <input
        readOnly
        value={link}
        onClick={(e) => (e.target as HTMLInputElement).select()}
        className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="bg-sky-700 hover:bg-sky-600 text-white font-semibold rounded px-4 py-2 text-sm"
        >
          {copied ? "✓ Copiado" : "📋 Copiar"}
        </button>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded px-4 py-2 text-sm"
        >
          Abrir en pestaña ↗
        </a>
      </div>
    </div>
  );
}
