import { redirect } from "next/navigation";
import Link from "next/link";
import { PLANS, formatPrice, type PlanId } from "@/lib/plans";
import { createOrgAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CreateOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const planId = (sp.plan ?? "trial") as PlanId;
  const plan = PLANS[planId];
  if (!plan || planId === "enterprise") redirect("/signup");

  return (
    <main className="min-h-screen bg-white text-zinc-900 p-6 sm:p-12 flex items-center justify-center">
      <div className="w-full max-w-md">
        <Link href="/signup" className="text-sm text-zinc-700 hover:text-zinc-700 mb-6 inline-block">
          ← Cambiar plan
        </Link>
        <h1 className="text-2xl font-bold mb-1">Crear barrio</h1>
        <p className="text-zinc-700 mb-6">
          Plan <span className="text-zinc-900 font-medium">{plan.name}</span> · {formatPrice(plan)}
        </p>

        <form action={createOrgAction} className="space-y-4">
          <input type="hidden" name="plan" value={planId} />

          <Field label="Nombre del barrio" name="org_name" placeholder="Barrio Los Álamos" required />
          <Field
            label="Subdominio"
            name="slug"
            placeholder="losalamos"
            required
            hint="Vas a entrar desde subdominio.interapp.com"
            pattern="[a-z0-9-]{3,40}"
          />

          <div className="border-t border-zinc-200 pt-4 space-y-4">
            <Field label="Tu email" name="email" type="email" required />
            <Field label="Tu contraseña" name="password" type="password" required minLength={8} />
            <Field label="Tu nombre completo" name="full_name" required />
          </div>

          {sp.error && (
            <p className="text-rose-700 text-sm">{decodeURIComponent(sp.error)}</p>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 font-semibold py-3 rounded-xl"
          >
            {plan.priceArs > 0 ? "Continuar al pago" : "Crear barrio"}
          </button>

          <p className="text-xs text-zinc-700 text-center">
            Al crear, aceptás los términos del servicio. Podés cancelar cuando quieras.
          </p>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm mb-1 text-zinc-700">{label}</label>
      <input
        {...props}
        className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3"
      />
      {hint && <p className="text-xs text-zinc-700 mt-1">{hint}</p>}
    </div>
  );
}
