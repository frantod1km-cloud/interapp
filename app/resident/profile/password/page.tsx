import Link from "next/link";
import { changePasswordAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="max-w-md">
      <Link
        href="/resident/profile"
        className="text-sm text-zinc-400 hover:text-white inline-block mb-4"
      >
        ← Volver a mi perfil
      </Link>
      <h1 className="text-2xl font-bold mb-2">Cambiar contraseña</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Necesitás recordar la nueva, no se puede recuperar después.
      </p>

      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 text-rose-300 rounded-2xl p-4 mb-4 text-sm">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form action={changePasswordAction} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-sm mb-1 text-zinc-400">Nueva contraseña</label>
          <input
            type="password"
            name="new_password"
            required
            minLength={8}
            autoFocus
            autoComplete="new-password"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
          />
          <p className="text-xs text-zinc-500 mt-1">Al menos 8 caracteres.</p>
        </div>
        <div>
          <label className="block text-sm mb-1 text-zinc-400">Repetir contraseña</label>
          <input
            type="password"
            name="confirm"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl"
        >
          Actualizar contraseña
        </button>
      </form>
    </div>
  );
}
