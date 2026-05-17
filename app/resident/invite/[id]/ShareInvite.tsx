"use client";

import { useState } from "react";

export default function ShareInvite({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Te paso el link para que cargues tu DNI antes de llegar al barrio:\n${url}`,
  )}`;

  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm break-all">
        {url}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={copy}
          className="bg-zinc-800 hover:bg-zinc-700 font-semibold py-3 rounded-xl"
        >
          {copied ? "✓ Copiado" : "Copiar link"}
        </button>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-emerald-600 hover:bg-emerald-500 text-center font-semibold py-3 rounded-xl"
        >
          Enviar por WhatsApp
        </a>
      </div>
    </div>
  );
}
