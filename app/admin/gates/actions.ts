"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";

async function requireOrgAdmin(): Promise<{ orgId: string }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") throw new Error("Solo el admin del barrio puede hacer esto");
  return { orgId: org.id };
}

function fail(msg: string): never {
  redirect(`/admin/gates?error=${encodeURIComponent(msg)}`);
}

export async function addGateAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) fail("El nombre es obligatorio");

  const supabase = await createClient();
  const { error } = await supabase.from("gates").insert({ organization_id: orgId, name });
  if (error) fail(error.message);

  revalidatePath("/admin/gates");
}

export async function toggleGateAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const gateId = String(formData.get("gate_id") ?? "");
  const active = formData.get("active") === "true";
  if (!gateId) return;

  const supabase = await createClient();
  await supabase
    .from("gates")
    .update({ active })
    .eq("id", gateId)
    .eq("organization_id", orgId);

  revalidatePath("/admin/gates");
}
