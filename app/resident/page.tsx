import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import { revokeAuthAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ResidentHome() {
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // El resident_id del usuario actual en esta org
  const { data: resident } = await supabase
    .from("residents")
    .select("id, first_name, last_name, unit")
    .eq("organization_id", org.id)
    .eq("user_id", user!.id)
    .maybeSingle();

  const { data: auths } = await supabase
    .from("authorizations")
    .select("id, dni, visitor_name, valid_until, invite_token, claimed_at, created_at")
    .eq("organization_id", org.id)
    .eq("resident_id", resident?.id ?? "00000000-0000-0000-0000-000000000000")
    .eq("revoked", false)
    .gte("valid_until", new Date().toISOString())
    .order("valid_until", { ascending: true });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Hola{resident ? `, ${resident.first_name}` : ""}</h1>
        {resident?.unit && <p className="text-sm text-zinc-500">{resident.unit}</p>}
      </header>

      {!resident ? (
        <div className="bg-amber-600/20 border border-amber-600/40 rounded-2xl p-4 text-sm">
          Todavía no estás asociado como residente en este barrio. Pedile a la
          administración que te de de alta con tu DNI y email.
        </div>
      ) : (
        <>
          <div className="flex gap-3 mb-6">
            <Link
              href="/resident/authorize"
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-center font-semibold py-4 rounded-2xl"
            >
              + Autorizar visita
            </Link>
            <Link
              href="/resident/invite"
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-center font-semibold py-4 rounded-2xl"
            >
              Generar link
            </Link>
          </div>

          <h2 className="text-sm uppercase tracking-wider text-zinc-500 mb-3">Vigentes</h2>
          <div className="space-y-2">
            {(auths ?? []).length === 0 && (
              <p className="text-zinc-500 text-sm">No tenés visitas autorizadas en este momento.</p>
            )}
            {(auths ?? []).map((a) => (
              <div key={a.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {a.visitor_name ?? (a.invite_token && !a.claimed_at ? "Esperando que cargue el DNI" : "Visitante")}
                  </div>
                  <div className="text-sm text-zinc-400">
                    {a.dni ? `DNI ${formatDni(a.dni)}` : "Sin DNI todavía"} · vence {new Date(a.valid_until).toLocaleString("es-AR")}
                  </div>
                  {a.invite_token && !a.claimed_at && (
                    <Link
                      href={`/resident/invite/${a.id}`}
                      className="text-emerald-400 text-sm underline mt-1 inline-block"
                    >
                      Ver / compartir link
                    </Link>
                  )}
                </div>
                <form action={revokeAuthAction}>
                  <input type="hidden" name="auth_id" value={a.id} />
                  <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-rose-700">
                    Revocar
                  </button>
                </form>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
