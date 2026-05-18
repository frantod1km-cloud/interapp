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
    .select("occurred_at, dni, full_name, direction, result, reason, vehicle_plate, vehicle_make, vehicle_model, vehicle_color, companions, companions_data, notes, gate_label")
    .eq("organization_id", org.id)
    .gte("occurred_at", from.toISOString())
    .lte("occurred_at", to.toISOString())
    .order("occurred_at", { ascending: false });

  const header = [
    "fecha_hora",
    "dni",
    "nombre",
    "sentido",
    "resultado",
    "patente",
    "marca",
    "modelo",
    "color",
    "acompañantes",
    "acompañantes_detalle",
    "nota",
    "motivo",
    "garita",
  ];
  const rows = (events ?? []).map((e) => {
    const cdata = Array.isArray(e.companions_data)
      ? (e.companions_data as Array<{ dni: string; full_name: string }>)
      : [];
    const detail = cdata.map((c) => `${c.full_name} (${c.dni})`).join("; ");
    return [
      new Date(e.occurred_at).toLocaleString("es-AR"),
      e.dni,
      e.full_name,
      e.direction === "in" ? "entrada" : "salida",
      e.result,
      e.vehicle_plate,
      e.vehicle_make,
      e.vehicle_model,
      e.vehicle_color,
      String(e.companions ?? 0),
      detail,
      e.notes,
      e.reason,
      e.gate_label,
    ];
  });

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
