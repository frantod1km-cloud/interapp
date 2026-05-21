import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Endpoint de healthcheck. Devuelve 200 si la app puede hablar con la DB,
// 503 si no. Lo podés usar para uptime monitoring (UptimeRobot, Pingdom,
// Better Uptime, etc.) o desde el load balancer.

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("organizations").select("id", { count: "exact", head: true });
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      db: "ok",
      ms: Date.now() - start,
      time: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        db: "error",
        error: e instanceof Error ? e.message : String(e),
        ms: Date.now() - start,
      },
      { status: 503 },
    );
  }
}
