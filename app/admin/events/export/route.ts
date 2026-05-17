import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";

export const dynamic = "force-dynamic";

// Export CSV de eventos del rango pedido. Por defecto: hoy.
// GET /admin/events/export?from=2026-05-01&to=2026-05-17

function csvEscape(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const org = await getCurrentOrg();
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 404 });
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const from = url.searchParams.get("from")
    ? new Date(url.searchParams.get("from")!)
    : startOfDay;
  const to = url.searchParams.get("to")
    ? new Date(url.searchParams.get("to")!)
    : endOfDay;

  const supabase = await createClient();
  const { data: events } = await supabase
    .from("access_events")
    .select("occurred_at, dni, full_name, direction, result, reason, vehicle_plate")
    .eq("organization_id", org.id)
    .gte("occurred_at", from.toISOString())
    .lte("occurred_at", to.toISOString())
    .order("occurred_at", { ascending: false });

  const header = ["fecha_hora", "dni", "nombre", "sentido", "resultado", "motivo", "patente"];
  const rows = (events ?? []).map((e) => [
    new Date(e.occurred_at).toLocaleString("es-AR"),
    e.dni,
    e.full_name,
    e.direction === "in" ? "entrada" : "salida",
    e.result,
    e.reason,
    e.vehicle_plate,
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((c) => csvEscape(c as string | null)).join(","))
    .join("\n");

  // BOM para que Excel detecte UTF-8 con acentos
  const body = "﻿" + csv;

  const fname = `eventos_${org.slug}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fname}"`,
    },
  });
}
