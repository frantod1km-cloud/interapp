import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { packageAge } from "@/lib/packages/age";
import { residentMarkDeliveredAction } from "@/app/admin/packages/actions";
import PinButton from "./PinButton";

export const dynamic = "force-dynamic";

export default async function ResidentPackagesPage() {
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: resident } = await supabase
    .from("residents")
    .select("id")
    .eq("organization_id", org.id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!resident) {
    return (
      <div>
        <Link href="/resident" className="text-sm text-zinc-400 hover:text-zinc-400 inline-block mb-4">
          ← Volver
        </Link>
        <p className="text-zinc-400 text-sm">No estás asociado como residente.</p>
      </div>
    );
  }

  const { data: pkgs } = await supabase
    .from("packages")
    .select(
      "id, description, courier, photo_url, status, received_at, delivered_at, delivered_to, gate_label, pickup_pin, pickup_pin_holder",
    )
    .eq("organization_id", org.id)
    .eq("resident_id", resident.id)
    .order("received_at", { ascending: false })
    .limit(50);

  const pending = (pkgs ?? []).filter((p) => p.status === "pending");
  const history = (pkgs ?? []).filter((p) => p.status !== "pending");

  return (
    <div>
      <Link href="/resident" className="text-sm text-zinc-400 hover:text-zinc-400 inline-block mb-4">
        ← Volver
      </Link>
      <h1 className="text-2xl font-bold mb-6">Mis paquetes</h1>

      {/* Pendientes */}
      <section className="mb-6">
        <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-3">
          En la garita ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-zinc-400 text-sm">No tenés paquetes esperando.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((p) => {
              const age = packageAge(p.received_at);
              return (
                <div
                  key={p.id}
                  className="bg-zinc-950 border border-sky-600/40 rounded-2xl p-4"
                >
                  <div className="flex gap-3 items-start">
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
                      </div>
                      <div className="text-sm text-zinc-400">
                        {p.courier && <>{p.courier} · </>}
                        {new Date(p.received_at).toLocaleString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {p.gate_label && ` · ${p.gate_label}`}
                      </div>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <form action={residentMarkDeliveredAction}>
                          <input type="hidden" name="package_id" value={p.id} />
                          <button className="text-xs bg-emerald-700/30 hover:bg-emerald-600 text-emerald-400 px-3 py-1 rounded">
                            Ya lo retiré
                          </button>
                        </form>
                        <PinButton
                          packageId={p.id}
                          description={p.description}
                          orgName={org.name}
                          existingPin={p.pickup_pin}
                          holderName={p.pickup_pin_holder}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Historial */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-3">Historial</h2>
        {history.length === 0 ? (
          <p className="text-zinc-400 text-sm">Sin historial aún.</p>
        ) : (
          <div className="space-y-2">
            {history.map((p) => (
              <div
                key={p.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex gap-3 items-center"
              >
                {p.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.photo_url}
                    alt=""
                    className="w-12 h-12 rounded-md object-cover bg-zinc-800 flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-md bg-zinc-800 flex items-center justify-center text-xl flex-shrink-0">
                    📦
                  </div>
                )}
                <div className="flex-1 min-w-0 text-sm">
                  <div className="font-medium">{p.description}</div>
                  <div className="text-xs text-zinc-400">
                    {p.status === "delivered" ? "Entregado" : "Devuelto"}
                    {p.delivered_at &&
                      ` · ${new Date(p.delivered_at).toLocaleDateString("es-AR")}`}
                    {p.delivered_to && ` · a ${p.delivered_to}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
