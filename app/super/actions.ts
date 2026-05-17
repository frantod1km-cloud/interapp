"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

async function requireSuper(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isSuper = (user?.user_metadata as { is_super?: boolean } | null)?.is_super === true;
  if (!user || !isSuper) throw new Error("No autorizado");
  return { userId: user.id };
}

const ALLOWED_STATUS = new Set(["active", "past_due", "suspended", "archived"]);

export async function setOrgStatusAction(formData: FormData) {
  const { userId } = await requireSuper();
  const orgId = String(formData.get("org_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!orgId || !ALLOWED_STATUS.has(status)) throw new Error("Datos inválidos");

  const admin = createAdminClient();
  await admin.from("organizations").update({ status }).eq("id", orgId);

  await logAudit({
    orgId,
    userId,
    action: status === "suspended" ? "org.suspend" : "org.reactivate",
    entityType: "organization",
    entityId: orgId,
    metadata: { new_status: status, by: "super_admin" },
  });

  revalidatePath("/super");
}
