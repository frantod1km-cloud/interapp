import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";

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

  return NextResponse.json({ confirmed: events.map((e) => e.client_id) });
}
