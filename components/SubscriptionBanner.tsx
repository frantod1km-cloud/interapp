import type { Organization } from "@/lib/org";

// Banner persistente arriba del panel del admin si el estado de la suscripción
// requiere atención. No bloquea la app — el guardia sigue funcionando — pero
// avisa fuerte para que regularicen el pago.

export function SubscriptionBanner({ org }: { org: Organization }) {
  if (org.status === "active") return null;

  const config =
    org.status === "past_due"
      ? {
          bg: "bg-amber-600",
          title: "Pago pendiente",
          msg: "Tu suscripción tiene un pago pendiente. Regularizalo para no perder el acceso.",
        }
      : org.status === "suspended"
        ? {
            bg: "bg-rose-700",
            title: "Cuenta suspendida",
            msg: "Tu cuenta está suspendida por falta de pago. El control de accesos sigue operativo pero no podés modificar datos.",
          }
        : {
            bg: "bg-zinc-700",
            title: "Estado de la suscripción",
            msg: `Estado actual: ${org.status}`,
          };

  return (
    <div className={`${config.bg} text-white px-6 py-3 text-sm flex items-center justify-between`}>
      <div>
        <strong>{config.title}.</strong> {config.msg}
      </div>
      <a href="/admin/billing" className="underline font-medium ml-4 whitespace-nowrap">
        Ir a facturación
      </a>
    </div>
  );
}
