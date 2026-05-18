import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { PLANS, formatPrice, type PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: { label: "Activa", className: "text-emerald-700" },
  trial: { label: "Prueba", className: "text-sky-700" },
  pending: { label: "Pendiente de pago", className: "text-amber-700" },
  past_due: { label: "Pago vencido", className: "text-amber-700" },
  suspended: { label: "Suspendida", className: "text-rose-700" },
  cancelled: { label: "Cancelada", className: "text-zinc-700" },
};

export default async function BillingPage() {
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan, status, mp_preapproval_id, current_period_end, updated_at")
    .eq("organization_id", org.id)
    .maybeSingle();

  const plan = sub ? PLANS[sub.plan as PlanId] : null;
  const status = sub?.status ?? "pending";
  const label = STATUS_LABEL[status] ?? { label: status, className: "" };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Facturación</h1>

      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4">
        <Row label="Plan actual" value={plan?.name ?? "—"} />
        <Row label="Precio" value={plan ? formatPrice(plan) : "—"} />
        <Row
          label="Estado"
          value={<span className={`font-semibold ${label.className}`}>{label.label}</span>}
        />
        {sub?.current_period_end && (
          <Row
            label="Próximo cobro"
            value={new Date(sub.current_period_end).toLocaleDateString("es-AR")}
          />
        )}
      </div>

      {(status === "pending" || status === "past_due") && (
        <div className="mt-6 bg-amber-600/20 border border-amber-600/40 rounded-2xl p-6">
          <h2 className="font-semibold mb-2">Hay un pago pendiente</h2>
          <p className="text-sm text-zinc-700 mb-4">
            Tu cuenta queda activa por unos días, pero si no se resuelve va a entrar en estado
            suspendido. Si ya pagaste, esperá unos minutos a que Mercado Pago confirme.
          </p>
        </div>
      )}

      {status === "active" && (
        <p className="mt-6 text-sm text-zinc-700">
          Para cancelar, escribinos a <a className="underline" href="mailto:soporte@interapp.com">soporte@interapp.com</a>.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-zinc-700">{label}</span>
      <span>{value}</span>
    </div>
  );
}
