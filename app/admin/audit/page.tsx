import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, { label: string; className: string }> = {
  "org.suspend": { label: "Suspensión de org", className: "text-rose-400" },
  "org.reactivate": { label: "Reactivación de org", className: "text-emerald-400" },
  "resident.create": { label: "Alta de residente", className: "text-emerald-400" },
  "resident.invite": { label: "Invitación a residente", className: "text-emerald-400" },
  "resident.deactivate": { label: "Baja de residente", className: "text-amber-400" },
  "resident.reactivate": { label: "Reactivación de residente", className: "text-emerald-400" },
  "guard.create": { label: "Alta de guardia", className: "text-emerald-400" },
  "guard.remove": { label: "Baja de guardia", className: "text-rose-400" },
  "vehicle.create": { label: "Alta de vehículo", className: "text-emerald-400" },
  "vehicle.remove": { label: "Baja de vehículo", className: "text-amber-400" },
  "package.create": { label: "Paquete recibido", className: "text-sky-400" },
  "package.deliver": { label: "Paquete entregado", className: "text-emerald-400" },
  "package.return": { label: "Paquete devuelto", className: "text-amber-400" },
  "authorization.create": { label: "Autorización creada", className: "text-emerald-400" },
  "authorization.revoke": { label: "Autorización revocada", className: "text-amber-400" },
  "access_event.forced": { label: "Ingreso forzado", className: "text-amber-400" },
  "subscription.status_change": { label: "Cambio de suscripción", className: "text-sky-400" },
};

export default async function AuditPage() {
  const org = (await getCurrentOrg())!;
  const admin = createAdminClient();

  const { data: entries } = await admin
    .from("audit_log")
    .select("id, action, entity_type, entity_id, metadata, occurred_at, user_id")
    .eq("organization_id", org.id)
    .order("occurred_at", { ascending: false })
    .limit(300);

  // Cache de emails de actores
  const userEmails = new Map<string, string>();
  const uniqueUserIds = Array.from(new Set((entries ?? []).map((e) => e.user_id).filter(Boolean) as string[]));
  for (const uid of uniqueUserIds) {
    const { data: u } = await admin.auth.admin.getUserById(uid);
    if (u?.user?.email) userEmails.set(uid, u.user.email);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Registro de auditoría</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Quién hizo qué y cuándo. Se guardan acciones administrativas: altas, bajas, invitaciones,
        ingresos forzados, cambios de estado de la suscripción.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-3">Fecha y hora</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((e) => {
              const a = ACTION_LABEL[e.action] ?? { label: e.action, className: "" };
              const actorEmail = e.user_id ? userEmails.get(e.user_id) : null;
              const meta = e.metadata as Record<string, unknown> | null;
              return (
                <tr key={e.id} className="border-t border-zinc-800 align-top">
                  <td className="px-4 py-3 tabular-nums text-zinc-300 whitespace-nowrap">
                    {new Date(e.occurred_at).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className={`px-4 py-3 font-medium whitespace-nowrap ${a.className}`}>
                    {a.label}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{actorEmail ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {meta ? (
                      <code className="break-all">{JSON.stringify(meta)}</code>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!entries || entries.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Aún no hay eventos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
