import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// Configuración VAPID (Voluntary Application Server Identification).
// Las keys se generan con: npx web-push generate-vapid-keys
// La pública va al cliente; la privada solo al servidor.

function configured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

let initialized = false;
function ensureInit() {
  if (initialized) return;
  if (!configured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  initialized = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;          // a dónde ir si tocan la notificación
};

// Manda una notificación a todos los dispositivos de un usuario.
// Si alguna suscripción ya no es válida (410/404), la borramos.
export async function pushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  if (!configured()) {
    console.warn("VAPID no configurado — saltando push");
    return { sent: 0, pruned: 0 };
  }
  ensureInit();

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { sent: 0, pruned: 0 };

  let sent = 0;
  let pruned = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 },
        );
        sent++;
        await admin
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Suscripción expirada o cancelada — la borramos
          await admin.from("push_subscriptions").delete().eq("id", s.id);
          pruned++;
        } else {
          console.error("push send error", e);
        }
      }
    }),
  );

  return { sent, pruned };
}
