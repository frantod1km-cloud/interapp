"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";

const KINDS = new Set(["owner", "tenant", "family", "staff", "domestic", "contractor"]);

async function requireOrgAdmin(): Promise<{ orgId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") throw new Error("Solo el admin del barrio puede hacer esto");
  return { orgId: org.id };
}

function fail(msg: string): never {
  redirect(`/admin/access-rules?error=${encodeURIComponent(msg)}`);
}

export async function upsertRuleAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();

  const kind = String(formData.get("kind") ?? "");
  if (!KINDS.has(kind)) fail("Categoría inválida");

  const weekdayMask = parseInt(String(formData.get("weekday_mask") ?? "127"));
  const startHour = parseInt(String(formData.get("start_hour") ?? "0"));
  const endHour = parseInt(String(formData.get("end_hour") ?? "23"));
  const enabled = formData.get("enabled") === "on";

  if (isNaN(weekdayMask) || weekdayMask < 0 || weekdayMask > 127) fail("Días inválidos");
  if (isNaN(startHour) || startHour < 0 || startHour > 23) fail("Hora desde inválida");
  if (isNaN(endHour) || endHour < 0 || endHour > 23) fail("Hora hasta inválida");

  const supabase = await createClient();
  const { error } = await supabase.from("access_rules").upsert(
    {
      organization_id: orgId,
      kind,
      weekday_mask: weekdayMask,
      start_hour: startHour,
      end_hour: endHour,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,kind" },
  );
  if (error) fail(error.message);

  revalidatePath("/admin/access-rules");
  redirect("/admin/access-rules?saved=1");
}

export async function deleteRuleAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const kind = String(formData.get("kind") ?? "");
  if (!KINDS.has(kind)) return;

  const supabase = await createClient();
  await supabase
    .from("access_rules")
    .delete()
    .eq("organization_id", orgId)
    .eq("kind", kind);

  revalidatePath("/admin/access-rules");
  redirect("/admin/access-rules?saved=1");
}
