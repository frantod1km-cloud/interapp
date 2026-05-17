import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ResidentHistoryPage() {
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
    return <p className="text-zinc-500 text-sm">No estás asociado como residente.</p>;
  }

  // Eventos de personas que vinieron con autorización mía
  const { data: events } = await supabase
    .from("access_events")
    .select("id, dni, full_name, direction, result, occurred_at, authorization_id, authorizations!inner(resident_id)")
    .eq("organization_id", org.id)
    .eq("authorizations.resident_id", resident.id)
    .order("occurred_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <Link href="/resident" className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 inline-block">
        ← Volver
      </Link>
      <h1 className="text-2xl font-bold mb-6">Mis visitas recientes</h1>
      <div className="space-y-2">
        {(events ?? []).length === 0 && (
          <p className="text-zinc-500 text-sm">Todavía no entró ninguna de tus visitas.</p>
        )}
        {(events ?? []).map((e) => (
          <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="font-medium">{e.full_name ?? "Visitante"}</div>
            <div className="text-sm text-zinc-400">
              DNI {formatDni(e.dni)} ·{" "}
              {new Date(e.occurred_at).toLocaleString("es-AR")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
