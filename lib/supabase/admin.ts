import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS. Use ONLY in trusted server contexts
// (webhooks, cron, super_admin endpoints). Never import this from the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
