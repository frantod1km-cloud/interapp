import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Rate limiter backed by Postgres. Pensado para endpoints públicos donde
// queremos prevenir abuso (signup, claim de invite, push subscribe, etc).
//
// Usa la función rate_limit_record(identifier, action, window_seconds)
// definida en migration 0006 que es atómica.
//
// Si Supabase no está disponible (edge case), fail-open (permitir) para no
// romper la app. Logueamos para que se note.

export async function clientIp(): Promise<string> {
  const h = await headers();
  // Vercel y la mayoría de proxies setean x-forwarded-for
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  max: number;
  retryAfterSeconds: number;
};

export async function rateLimit(opts: {
  identifier: string;
  action: string;
  max: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_record", {
      p_identifier: opts.identifier,
      p_action: opts.action,
      p_window_seconds: opts.windowSeconds,
    });

    if (error) {
      console.error("rate limit rpc error", error);
      return { allowed: true, count: 0, max: opts.max, retryAfterSeconds: 0 };
    }

    const count = (data as number) ?? 0;
    const allowed = count <= opts.max;
    return {
      allowed,
      count,
      max: opts.max,
      retryAfterSeconds: allowed ? 0 : opts.windowSeconds,
    };
  } catch (e) {
    console.error("rate limit fail", e);
    return { allowed: true, count: 0, max: opts.max, retryAfterSeconds: 0 };
  }
}
