import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import type { Snapshot } from "@/lib/offline/db";

// Devuelve el padrón completo de la org actual para que el guardia pueda
// trabajar offline. Pensado para llamarse cada vez que el guardia abre la
// pantalla y/o cada X minutos en background.

export const dynamic = "force-dynamic";

export async function GET() {
  const org = await getCurrentOrg();
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 404 });

  const role = await getCurrentMemberRole(org.id);
  if (role !== "guard" && role !== "org_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const [residentsResp, authsResp, vehiclesResp] = await Promise.all([
    supabase
      .from("residents")
      .select("id, dni, first_name, last_name, unit, kind")
      .eq("organization_id", org.id)
      .eq("active", true),
    supabase
      .from("authorizations")
      .select("id, dni, visitor_name, resident_id, valid_until, residents(first_name, last_name)")
      .eq("organization_id", org.id)
      .eq("revoked", false)
      .not("dni", "is", null)
      .gte("valid_until", new Date().toISOString()),
    supabase
      .from("vehicles")
      .select("plate, make, model, color, resident_id")
      .eq("organization_id", org.id),
  ]);

  type AuthRow = {
    id: string;
    dni: string | null;
    visitor_name: string | null;
    resident_id: string;
    valid_until: string;
    residents: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
  };

  const snap: Snapshot = {
    fetched_at: new Date().toISOString(),
    organization_id: org.id,
    residents: residentsResp.data ?? [],
    authorizations: ((authsResp.data ?? []) as AuthRow[]).map((a) => {
      const r = Array.isArray(a.residents) ? a.residents[0] : a.residents;
      return {
        id: a.id,
        dni: a.dni as string,
        visitor_name: a.visitor_name,
        resident_id: a.resident_id,
        resident_name: r ? `${r.first_name} ${r.last_name}` : null,
        valid_until: a.valid_until,
      };
    }),
    vehicles: vehiclesResp.data ?? [],
  };

  return NextResponse.json(snap);
}
