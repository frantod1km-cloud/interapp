// Catálogo de planes. Cambiarlo acá basta — no hay tabla de planes en la DB
// porque son pocos y casi nunca cambian. Si en algún momento tienen que ser
// editables desde el panel super admin, movemos esto a Postgres.

export type PlanId = "trial" | "basic" | "pro" | "enterprise";

export type Plan = {
  id: PlanId;
  name: string;
  priceArs: number;          // 0 = trial, -1 = a definir
  maxUnits: number | null;   // null = sin límite
  description: string;
  features: string[];
  ctaLabel: string;
};

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Prueba 30 días",
    priceArs: 0,
    maxUnits: 50,
    description: "Probalo gratis con tu barrio chico o un sector piloto.",
    features: [
      "Hasta 50 unidades",
      "1 garita",
      "Soporte por email",
      "Sin tarjeta",
    ],
    ctaLabel: "Empezar prueba",
  },
  basic: {
    id: "basic",
    name: "Básico",
    priceArs: 19000,
    maxUnits: 200,
    description: "Para barrios chicos y edificios.",
    features: [
      "Hasta 200 unidades",
      "1 garita",
      "Panel de residentes",
      "Soporte por email",
    ],
    ctaLabel: "Elegir Básico",
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceArs: 39000,
    maxUnits: 1000,
    description: "Countries y barrios medianos.",
    features: [
      "Hasta 1000 unidades",
      "Hasta 3 garitas",
      "Reportes y exports",
      "Soporte prioritario",
    ],
    ctaLabel: "Elegir Pro",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceArs: -1,
    maxUnits: null,
    description: "Countries grandes y parques industriales.",
    features: [
      "Sin límite de unidades",
      "Garitas ilimitadas",
      "Integración con barreras / OCR de patentes",
      "SLA y onboarding dedicado",
    ],
    ctaLabel: "Hablar con ventas",
  },
};

export const PUBLIC_PLAN_IDS: PlanId[] = ["trial", "basic", "pro", "enterprise"];

export function formatPrice(plan: Plan): string {
  if (plan.priceArs === 0) return "Gratis";
  if (plan.priceArs === -1) return "A medida";
  return `$${plan.priceArs.toLocaleString("es-AR")} / mes`;
}
