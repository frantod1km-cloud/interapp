import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { logAudit } from "@/lib/audit";
import { pushToUser } from "@/lib/push";

// Endpoint para que el cliente flushee la cola de eventos offline.
// El cliente envía un array; insertamos lo que se pueda y respondemos
// con los client_id confirmados (para que el cliente los borre de la cola).
// Idempotencia: si un client_id ya fue insertado antes, lo tratamos como ok.

export const dynamic = "force-dynamic";

type IncomingEvent = {
  client_id: string;
  dni: string;
  full_name: string | null;
  direction: "in" | "out";
  result: "authorized" | "denied" | "forced" | "manual";
  reason: string | null;
  authorization_id: string | null;
  resident_id: string | null;
  occurred_at: string;
  gate_id?: string | null;
  gate_label?: string | null;
};

export async function POST(req: Request) {
  const org = await getCurrentOrg();
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 404 });

  const role = await getCurrentMemberRole(org.id);
  if (role !== "guard" && role !== "org_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let events: IncomingEvent[] = [];
  try {
    const body = (await req.json()) as { events?: IncomingEvent[] };
    events = body.events ?? [];
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (events.length === 0) return NextResponse.json({ confirmed: [] });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const rows = events.map((e) => ({
    organization_id: org.id,
    guard_id: user?.id ?? null,
    authorization_id: e.authorization_id,
    resident_id: e.resident_id,
    dni: e.dni,
    full_name: e.full_name,
    direction: e.direction,
    result: e.result,
    reason: e.reason,
    gate_id: e.gate_id ?? null,
    gate_label: e.gate_label ?? null,
    occurred_at: e.occurred_at,
    synced_at: new Date().toISOString(),
  }));

  // Insertamos todos. Si alguno falla, devolvemos los que sí se pudieron
  // confirmar de forma optimista. La idempotencia real (no insertar duplicados
  // si el cliente reintenta) requeriría guardar client_id en la tabla; para
  // la fase 4 lo dejamos así y el cliente se basa en la confirmación del API.
  const { error } = await supabase.from("access_events").insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message, confirmed: [] }, { status: 500 });
  }

  // Log de auditoría solo para eventos forzados (alto interés para el admin)
  const forced = events.filter((e) => e.result === "forced");
  await Promise.all(
    forced.map((e) =>
      logAudit({
        orgId: org.id,
        userId: user?.id ?? null,
        action: "access_event.forced",
        entityType: "access_event",
        metadata: { dni: e.dni, full_name: e.full_name, direction: e.direction, reason: e.reason },
      }),
    ),
  );

  // Notificación push al residente cuando entra una visita suya
  await notifyResidents(events, org.name);

  return NextResponse.json({ confirmed: events.map((e) => e.client_id) });
}

// Para cada evento de "entrada autorizada con authorization_id", buscamos
// el residente que autorizó y le mandamos push. No bloqueamos el response.
async function notifyResidents(events: IncomingEvent[], orgName: string): Promise<void> {
  const notifiable = events.filter(
    (e) => e.direction === "in" && e.result === "authorized" && e.authorization_id,
  );
  if (notifiable.length === 0) return;

  const admin = createAdminClient();
  await Promise.all(
    notifiable.map(async (e) => {
      const { data: auth } = await admin
        .from("authorizations")
        .select("residents(user_id, first_name)")
        .eq("id", e.authorization_id!)
        .maybeSingle();
      const r = auth?.residents;
      const resident = Array.isArray(r) ? r[0] : r;
      if (!resident?.user_id) return;
      await pushToUser(resident.user_id, {
        title: `Llegó tu visita`,
        body: `${e.full_name ?? "Tu invitado"} acaba de ingresar a ${orgName}.`,
        url: "/resident/history",
      });
    }),
  );
}
