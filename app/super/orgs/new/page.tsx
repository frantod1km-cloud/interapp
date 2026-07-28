import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { createOrgManualAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="max-w-xl">
      <Link href="/super/orgs" className="text-xs text-zinc-400 hover:text-white">
        ← Volver
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-2">Crear barrio manual</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Salteás el signup público y la suscripción de Mercado Pago. Útil para
        onboarding manual, demos, o cuando el cliente paga por fuera.
      </p>

      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-3 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form
        action={createOrgManualAction}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
          Organización
        </h2>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Nombre del barrio</label>
          <input
            name="name"
            required
            placeholder="Los Álamos Country"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Subdominio (URL)</label>
          <input
            name="slug"
            required
            pattern="[a-z0-9-]{3,40}"
            placeholder="losalamos"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm font-mono"
          />
          <p className="text-[10px] text-zinc-500 mt-1">
            La URL va a ser: <span className="font-mono">algo.bzseguridad.online</span>
          </p>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Plan</label>
          <select
            name="plan"
            defaultValue="trial"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
          >
            {Object.entries(PLANS).map(([id, p]) => (
              <option key={id} value={id}>
                {p.name} — ${p.priceArs?.toLocaleString("es-AR") ?? "0"}/mes
              </option>
            ))}
          </select>
        </div>

        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300 pt-3 border-t border-zinc-800">
          Admin inicial
        </h2>
        <p className="text-xs text-zinc-500 -mt-2">
          Se crea la cuenta y queda como <em>org_admin</em> del barrio. Vas a poder loguear con
          este email y contraseña o darle acceso al cliente.
        </p>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Nombre completo</label>
          <input
            name="admin_name"
            placeholder="Juan Pérez"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Email</label>
          <input
            name="admin_email"
            type="email"
            required
            placeholder="admin@barrio.com"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Contraseña</label>
          <input
            name="admin_password"
            type="password"
            required
            minLength={10}
            placeholder="Mínimo 10 caracteres"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-3"
        >
          Crear barrio + admin
        </button>
      </form>
    </div>
  );
}
