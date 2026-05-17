import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushToUser } from "@/lib/push";

// Cron: cada cierto intervalo (sugerido 1 hora) busca paquetes pendientes que
// llevan más de 48h sin retirar y manda push al residente recordándole.
//
// Para no spamear, solo manda si han pasado más de 24h desde el último
// recordatorio (campo last_reminder_at).
//
// Seguridad: solo se ejecuta si el caller manda el header
//   Authorization: Bearer <CRON_SECRET>
// con el valor de la env var CRON_SECRET. Vercel Cron lo inyecta
// automáticamente cuando se configura via vercel.json.

const REMIND_AFTER_HOURS = 48;
const COOLDOWN_HOURS = 24;
const BATCH_LIMIT = 200; // por corrida, para no congelar

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else {
    console.warn("CRON_SECRET no configurado — el endpoint acepta cualquier request");
  }

  const admin = createAdminClient();
  const remindThreshold = new Date(Date.now() - REMIND_AFTER_HOURS * 3600 * 1000).toISOString();
  const cooldownThreshold = new Date(Date.now() - COOLDOWN_HOURS * 3600 * 1000).toISOString();

  // Pendientes con suficiente antigüedad y sin recordatorio reciente
  const { data: pkgs, error } = await admin
    .from("packages")
    .select(
      "id, organization_id, description, courier, last_reminder_at, residents(user_id, first_name), organizations(name)",
    )
    .eq("status", "pending")
    .lt("received_at", remindThreshold)
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${cooldownThreshold}`)
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("cron reminders fetch error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const p of pkgs ?? []) {
    const resident = Array.isArray(p.residents) ? p.residents[0] : p.residents;
    const org = Array.isArray(p.organizations) ? p.organizations[0] : p.organizations;
    if (!resident?.user_id) {
      skipped++;
      continue;
    }

    await pushToUser(resident.user_id, {
      title: `📦 Aún tenés un paquete en ${org?.name ?? "la garita"}`,
      body: `${p.description}${p.courier ? ` · ${p.courier}` : ""} — recordá pasarlo a buscar`,
      url: "/resident/packages",
    });
    sent++;

    await admin
      .from("packages")
      .update({ last_reminder_at: new Date().toISOString() })
      .eq("id", p.id);
  }

  return NextResponse.json({ ok: true, candidates: pkgs?.length ?? 0, sent, skipped });
}
