import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import EnableNotifications from "@/components/EnableNotifications";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    { count: residentsCount },
    { count: todayCount },
    { count: activeAuths },
    { count: guardsCount },
    { count: anyEvents },
  ] = await Promise.all([
    supabase.from("residents").select("*", { count: "exact", head: true }).eq("organization_id", org.id).eq("active", true),
    supabase.from("access_events").select("*", { count: "exact", head: true }).eq("organization_id", org.id).gte("occurred_at", startOfDay.toISOString()),
    supabase.from("authorizations").select("*", { count: "exact", head: true }).eq("organization_id", org.id).eq("revoked", false).gte("valid_until", new Date().toISOString()),
    supabase.from("org_members").select("*", { count: "exact", head: true }).eq("organization_id", org.id).eq("role", "guard"),
    supabase.from("access_events").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
  ]);

  // Pasos del onboarding: lo mostramos si el barrio está recién creado o
  // si todavía no se completaron los pasos esenciales.
  const steps = [
    { id: "residents", label: "Cargar residentes", done: (residentsCount ?? 0) > 0, href: "/admin/residents" },
    { id: "guards", label: "Crear al menos un guardia", done: (guardsCount ?? 0) > 0, href: "/admin/guards" },
    { id: "events", label: "Registrar el primer ingreso", done: (anyEvents ?? 0) > 0, href: "/guard" },
  ];
  const allDone = steps.every((s) => s.done);
  const showWizard = sp.welcome === "1" || !allDone;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {showWizard && (
        <div className="bg-gradient-to-br from-emerald-900/30 to-sky-900/20 border border-emerald-700/40 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-bold">
                {allDone ? "🎉 Tu barrio está listo" : "Configurá tu barrio en 3 pasos"}
              </h2>
              <p className="text-sm text-zinc-700">
                {allDone
                  ? "Ya completaste los pasos esenciales. Podés esconder este recuadro."
                  : "Mientras más pasos completes, antes podés empezar a usarlo de verdad."}
              </p>
            </div>
            <div className="text-sm text-zinc-700">
              {steps.filter((s) => s.done).length} de {steps.length}
            </div>
          </div>
          <div className="grid gap-2">
            {steps.map((s, idx) => (
              <Link
                key={s.id}
                href={s.href}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  s.done
                    ? "bg-emerald-900/30 border-emerald-700/40 text-zinc-700"
                    : "bg-white border border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                    s.done ? "bg-emerald-500 text-black" : "bg-zinc-200 text-zinc-700"
                  }`}
                >
                  {s.done ? "✓" : idx + 1}
                </div>
                <span className={`flex-1 font-medium ${s.done ? "line-through opacity-70" : ""}`}>
                  {s.label}
                </span>
                {!s.done && <span className="text-xs text-emerald-700">Ir →</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Ingresos hoy" value={todayCount ?? 0} />
        <Stat label="Residentes activos" value={residentsCount ?? 0} />
        <Stat label="Autorizaciones vigentes" value={activeAuths ?? 0} />
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl p-4">
        <h3 className="font-semibold mb-2 text-sm">Notificaciones del administrador</h3>
        <p className="text-xs text-zinc-700 mb-3">
          Activá las notificaciones de este dispositivo para enterarte al instante cuando un
          guardia fuerza un ingreso o cambia el estado de tu suscripción.
        </p>
        <EnableNotifications vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6">
      <div className="text-zinc-700 text-sm mb-2">{label}</div>
      <div className="text-4xl font-bold">{value}</div>
    </div>
  );
}
