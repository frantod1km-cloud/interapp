"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireSuper() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isSuper = (user?.user_metadata as { is_super?: boolean } | null)?.is_super === true;
  if (!user || !isSuper) throw new Error("No autorizado");
}

const ALLOWED_STATUS = new Set(["active", "past_due", "suspended", "archived"]);

export async function setOrgStatusAction(formData: FormData) {
  await requireSuper();
  const orgId = String(formData.get("org_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!orgId || !ALLOWED_STATUS.has(status)) throw new Error("Datos inválidos");

  const admin = createAdminClient();
  await admin.from("organizations").update({ status }).eq("id", orgId);
  revalidatePath("/super");
}
