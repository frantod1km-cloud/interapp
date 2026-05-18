import Link from "next/link";
import { PUBLIC_PLAN_IDS, PLANS, formatPrice } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  return (
    <main className="min-h-screen bg-white text-zinc-900 p-6 sm:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold">interapp</Link>
          <Link href="/login" className="text-sm text-zinc-700 hover:text-zinc-900">
            Iniciar sesión
          </Link>
        </header>

        <h1 className="text-4xl font-bold mb-3">Creá tu barrio</h1>
        <p className="text-zinc-700 mb-10">Elegí un plan. Podés cambiarlo o cancelar cuando quieras.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PUBLIC_PLAN_IDS.map((id) => {
            const plan = PLANS[id];
            return (
              <div
                key={plan.id}
                className="bg-white border border-zinc-200 rounded-2xl p-6 flex flex-col"
              >
                <div className="text-xs uppercase tracking-wider text-zinc-700 mb-1">
                  {plan.name}
                </div>
                <div className="text-2xl font-bold mb-2">{formatPrice(plan)}</div>
                <p className="text-sm text-zinc-700 mb-4">{plan.description}</p>
                <ul className="text-sm text-zinc-700 space-y-1.5 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-emerald-700">✓</span> {f}
                    </li>
                  ))}
                </ul>
                {plan.id === "enterprise" ? (
                  <a
                    href="mailto:ventas@interapp.com?subject=Enterprise"
                    className="bg-zinc-100 hover:bg-zinc-200 text-center font-semibold py-3 rounded-xl"
                  >
                    {plan.ctaLabel}
                  </a>
                ) : (
                  <Link
                    href={`/signup/create?plan=${plan.id}`}
                    className="bg-blue-600 hover:bg-blue-500 text-center font-semibold py-3 rounded-xl"
                  >
                    {plan.ctaLabel}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
