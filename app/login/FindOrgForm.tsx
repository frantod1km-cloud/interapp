"use client";

import Link from "next/link";
import { useState } from "react";

// Form para que el usuario tipee el subdominio de su barrio. Lo redirige
// a https://<slug>.<dominio>/login para que loguee ahí (donde la cookie
// se guarda con el alcance correcto del subdominio).
//
// En localhost soportamos <slug>.localhost:<port>/login automáticamente.

export default function FindOrgForm({ host }: { host: string }) {
  const [slug, setSlug] = useState("");

  // Calcular el dominio raíz para construir el redirect.
  // En localhost:3000 → root = localhost:3000, proto = http
  // En interapp.com → root = interapp.com, proto = https
  const hostname = host.split(":")[0];
  const port = host.includes(":") ? `:${host.split(":")[1]}` : "";
  const isLocalhost = hostname === "localhost" || hostname.endsWith(".localhost");
  const proto = isLocalhost ? "http" : "https";
  const rootDomain = isLocalhost
    ? `localhost${port}`
    : hostname.split(".").slice(-2).join(".") + port;

  const exampleUrl = `${proto}://test.${rootDomain}/login`;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleaned) return;
    window.location.href = `${proto}://${cleaned}.${rootDomain}/login`;
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-white text-zinc-900 p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4">
        <Link href="/" className="text-sm text-zinc-700 hover:text-zinc-700 inline-block mb-2">
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold">¿En qué barrio querés entrar?</h1>
        <p className="text-zinc-700 text-sm">
          Escribí el subdominio de tu barrio. Te llevamos a la página de login.
        </p>

        <div>
          <label className="block text-sm mb-1 text-zinc-700">Subdominio</label>
          <div className="flex items-center bg-white border border-zinc-200 rounded-lg overflow-hidden">
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="losalamos"
              className="flex-1 bg-transparent px-4 py-3 outline-none"
            />
            <span className="text-zinc-700 pr-4 text-sm">.{rootDomain}</span>
          </div>
          <p className="text-xs text-zinc-700 mt-1">
            Ejemplo: si tu barrio es <code className="bg-white border border-zinc-200 px-1 rounded">{exampleUrl}</code>, escribí <code className="bg-white border border-zinc-200 px-1 rounded">test</code>.
          </p>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-500 font-semibold py-3 rounded-lg"
        >
          Ir al login
        </button>

        <div className="pt-4 border-t border-zinc-200 text-center text-sm text-zinc-700">
          ¿Todavía no tenés barrio?{" "}
          <Link href="/signup" className="text-emerald-700 hover:text-emerald-700 font-medium">
            Creá uno gratis
          </Link>
        </div>
      </form>
    </main>
  );
}
