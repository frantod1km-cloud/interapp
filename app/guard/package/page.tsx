import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import { kindMeta } from "@/lib/resident-kinds";
import { packageAge } from "@/lib/packages/age";
import PackageForm from "./PackageForm";
import DeliverButton from "./DeliverButton";

export const dynamic = "force-dynamic";

// Pantalla del guardia: registrar un paquete que llega + ver los pendientes
// del día. Pensada para usarse desde la tablet de la garita entre escaneos
// de DNI. Vuelve fácilmente al modo control de acceso.

export default async function GuardPackagePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const org = await getCurrentOrg();
  if (!org) redirect("/");

  const role = await getCurrentMemberRole(org.id);
  if (role !== "guard" && role !== "guard_lead" && role !== "org_admin") {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-zinc-950 text-white">
        <p>Esta sección es para guardias.</p>
      </main>
    );
  }

  const supabase = await createClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [residentsResp, gatesResp, pendingResp] = await Promise.all([
    supabase
      .from("residents")
      .select("id, dni, first_name, last_name, unit, kind")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("last_name"),
    supabase
      .from("gates")
      .select("id, name")
      .eq("organization_id", org.id)
      .eq("active", true),
    supabase
      .from("packages")
      .select("id, description, courier, received_at, photo_url, pickup_pin, pickup_pin_holder, residents(first_name, last_name, unit, dni, kind)")
      .eq("organization_id", org.id)
      .eq("status", "pending")
      .order("received_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="flex items-center justify-between px-6 py-4 bg-black/40 border-b border-zinc-900">
        <div className="flex items-center gap-4">
          <Link href="/guard" className="text-sm text-zinc-500 hover:text-white">
            ← Control de acceso
          </Link>
          <h1 className="font-bold">📦 Paquetería · {org.name}</h1>
        </div>
        <form action="/api/logout" method="post">
          <button className="text-sm text-zinc-500 hover:text-white">Salir</button>
        </form>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {sp.ok && (
          <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-4 text-sm">
            ✅ Paquete registrado. Se notificó al residente.
          </div>
        )}
        {sp.error && (
          <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 text-sm text-rose-300">
            {decodeURIComponent(sp.error)}
          </div>
        )}

        {/* Form para recibir un paquete nuevo */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="font-bold text-lg mb-3">Recibir paquete</h2>
          <PackageForm
            residents={(residentsResp.data ?? []).map((r) => ({
              id: r.id,
              dni: r.dni,
              first_name: r.first_name,
              last_name: r.last_name,
              unit: r.unit,
              kind: r.kind,
            }))}
            gates={gatesResp.data ?? []}
          />
        </section>

        {/* Pendientes */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <header className="px-5 py-3 bg-zinc-950 font-bold flex items-center justify-between">
            <span>Pendientes de retirar ({pendingResp.data?.length ?? 0})</span>
          </header>
          {(pendingResp.data ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-zinc-500 text-sm">
              No hay paquetes esperando.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {pendingResp.data!.map((p) => {
                const r = Array.isArray(p.residents) ? p.residents[0] : p.residents;
                const km = r ? kindMeta(r.kind) : null;
                const age = packageAge(p.received_at);
                return (
                  <div key={p.id} className="p-4 flex gap-4 items-start">
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photo_url}
                        alt=""
                        className="w-20 h-20 rounded-lg object-cover bg-zinc-800 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-zinc-800 flex items-center justify-center text-3xl flex-shrink-0">
                        📦
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium">{p.description}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${age.className}`}>
                          {age.label}
                        </span>
                        {p.pickup_pin && (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            🔑 PIN activo
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-zinc-400">
                        {p.courier && <>{p.courier} · </>}
                        {new Date(p.received_at).toLocaleString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {r && (
                        <div className="text-sm mt-1">
                          {km && <span className="text-xs">{km.emoji}</span>}{" "}
                          <span className="text-zinc-300">
                            {r.last_name}, {r.first_name}
                          </span>
                          {r.unit && <span className="text-zinc-500"> · {r.unit}</span>}
                          <span className="text-zinc-500 tabular-nums"> · DNI {formatDni(r.dni)}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <DeliverButton
                        packageId={p.id}
                        hasPin={Boolean(p.pickup_pin)}
                        pinHolder={p.pickup_pin_holder}
                        defaultDeliveredTo={r ? `${r.first_name} ${r.last_name}` : "Retirado"}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
