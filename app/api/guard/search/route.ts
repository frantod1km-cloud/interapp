import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";

export const dynamic = "force-dynamic";

// Busca personas por DNI parcial, nombre, apellido o unidad. Mezcla
// resultados de residentes con acceso permanente + autorizaciones vigentes
// (invitados). Devuelve un máximo de 10 matches para mantenerlo liviano.

export async function GET(req: Request) {
  const org = await getCurrentOrg();
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 404 });
  const role = await getCurrentMemberRole(org.id);
  if (role !== "guard" && role !== "guard_lead" && role !== "org_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = await createClient();
  const term = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const digits = q.replace(/\D/g, "");

  // Buscar residentes
  const residentsResp = digits
    ? // Si el query es numérico, lo tratamos como búsqueda de DNI
      supabase
        .from("residents")
        .select("id, dni, first_name, last_name, unit, kind, active")
        .eq("organization_id", org.id)
        .eq("active", true)
        .ilike("dni", `%${digits}%`)
        .limit(6)
    : supabase
        .from("residents")
        .select("id, dni, first_name, last_name, unit, kind, active")
        .eq("organization_id", org.id)
        .eq("active", true)
        .or(`first_name.ilike.${term},last_name.ilike.${term},unit.ilike.${term}`)
        .limit(6);

  // Buscar autorizaciones vigentes
  const nowIso = new Date().toISOString();
  const authsResp = supabase
    .from("authorizations")
    .select("id, dni, visitor_name, valid_until, residents(first_name, last_name, unit)")
    .eq("organization_id", org.id)
    .eq("revoked", false)
    .not("dni", "is", null)
    .gte("valid_until", nowIso)
    .or(digits ? `dni.ilike.%${digits}%` : `visitor_name.ilike.${term}`)
    .limit(4);

  const [residents, auths] = await Promise.all([residentsResp, authsResp]);

  type Result = {
    kind: "resident" | "authorization";
    dni: string;
    name: string;
    detail: string;
    residentKind?: string;
  };

  const results: Result[] = [];

  for (const r of residents.data ?? []) {
    results.push({
      kind: "resident",
      dni: r.dni,
      name: `${r.last_name}, ${r.first_name}`,
      detail: r.unit ? `Unidad ${r.unit}` : "Acceso permanente",
      residentKind: r.kind,
    });
  }

  for (const a of auths.data ?? []) {
    const host = Array.isArray(a.residents) ? a.residents[0] : a.residents;
    results.push({
      kind: "authorization",
      dni: a.dni ?? "",
      name: a.visitor_name ?? "Visitante",
      detail: host
        ? `Invitado de ${host.first_name} ${host.last_name}${host.unit ? ` · ${host.unit}` : ""}`
        : "Invitado",
    });
  }

  return NextResponse.json({ results: results.slice(0, 10) });
}
