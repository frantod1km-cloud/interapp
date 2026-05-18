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
        className="text-sm text-zinc-600 hover:text-zinc-900 inline-block mb-4"
      >
        ← Volver a mi perfil
      </Link>
      <h1 className="text-2xl font-bold mb-2">Cambiar contraseña</h1>
      <p className="text-zinc-600 text-sm mb-6">
        Necesitás recordar la nueva, no se puede recuperar después.
      </p>

      {sp.error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-4 mb-4 text-sm">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form action={changePasswordAction} className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-sm mb-1 text-zinc-700">Nueva contraseña</label>
          <input
            type="password"
            name="new_password"
            required
            minLength={8}
            autoFocus
            autoComplete="new-password"
            className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3"
          />
          <p className="text-xs text-zinc-500 mt-1">Al menos 8 caracteres.</p>
        </div>
        <div>
          <label className="block text-sm mb-1 text-zinc-700">Repetir contraseña</label>
          <input
            type="password"
            name="confirm"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl"
        >
          Actualizar contraseña
        </button>
      </form>
    </div>
  );
}
