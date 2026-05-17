"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const isWelcome = sp.get("welcome") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      // Redirige a "/" — el server decide el destino real según el rol.
      // Esto evita revelar rutas al cliente.
      router.replace("/");
      router.refresh();
    });
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold mb-4">Iniciar sesión</h1>
        {isWelcome && (
          <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-xl p-3 text-sm">
            ✅ Tu barrio fue creado. Iniciá sesión con el email y contraseña que cargaste.
          </div>
        )}
        <div>
          <label className="block text-sm mb-1 text-zinc-400">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
          />
        </div>
        <div>
          <label className="block text-sm mb-1 text-zinc-400">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
          />
        </div>
        {error && <p className="text-rose-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-500 font-semibold py-3 rounded-lg disabled:opacity-50"
        >
          {isPending ? "Entrando…" : "Entrar"}
        </button>
        <p className="text-center text-xs text-zinc-500">
          ¿No tenés cuenta?{" "}
          <Link href="/" className="text-zinc-300 hover:text-white">
            Pedile acceso al admin de tu barrio
          </Link>
        </p>
      </form>
    </main>
  );
}
