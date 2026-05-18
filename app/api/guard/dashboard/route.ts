import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";

export const dynamic = "force-dynamic";

// Devuelve un resumen de "qué hay hoy" para que el guardia vea contadores
// en su pantalla de idle (paquetes pendientes, reservas hoy, ingresos del
// día, autorizaciones vigentes). Se llama cada minuto desde el GuardScreen.

export async function GET() {
  const org = await getCurrentOrg();
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 404 });

  const role = await getCurrentMemberRole(org.id);
  if (role !== "guard" && role !== "guard_lead" && role !== "org_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [
    { count: ingressesToday },
    { count: pendingPackages },
    { count: reservationsToday },
    { count: activeAuths },
  ] = await Promise.all([
    supabase
      .from("access_events")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .gte("occurred_at", startOfDay.toISOString()),
    supabase
      .from("packages")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "pending"),
    supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "confirmed")
      .gte("starts_at", startOfDay.toISOString())
      .lte("starts_at", endOfDay.toISOString()),
    supabase
      .from("authorizations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("revoked", false)
      .not("dni", "is", null)
      .gte("valid_until", new Date().toISOString()),
  ]);

  return NextResponse.json({
    ingressesToday: ingressesToday ?? 0,
    pendingPackages: pendingPackages ?? 0,
    reservationsToday: reservationsToday ?? 0,
    activeAuths: activeAuths ?? 0,
  });
}
