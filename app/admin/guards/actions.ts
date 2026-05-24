"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { logAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password";

// Si la acción fue disparada desde /guard/supervision (lo detectamos por
// referer), volvemos ahí. Si vino del panel admin, volvemos a /admin/guards.
async function returnPath(): Promise<"/admin/guards" | "/guard/supervision"> {
  const h = await headers();
  const ref = h.get("referer") ?? "";
  return ref.includes("/guard/supervision") ? "/guard/supervision" : "/admin/guards";
}

// Permitimos org_admin o guard_lead — ambos pueden manejar guardias.
// El guard_lead solo opera sobre role='guard' (la RLS también lo refuerza).
async function requireGuardManager(): Promise<{ orgId: string; userId: string; isLead: boolean }> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin" && role !== "guard_lead") {
    throw new Error("No tenés permiso para gestionar guardias");
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { orgId: org.id, userId: user!.id, isLead: role === "guard_lead" };
}

async function fail(msg: string): Promise<never> {
  const back = await returnPath();
  redirect(`${back}?error=${encodeURIComponent(msg)}`);
}

export async function createGuardAction(formData: FormData) {
  const { orgId, userId: actorId, isLead } = await requireGuardManager();
  const back = await returnPath();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const roleRaw = String(formData.get("role") ?? "guard");

  // El admin puede crear guard o guard_lead. El jefe de guardia solo guard.
  const targetRole =
    roleRaw === "guard_lead" && !isLead ? "guard_lead" : "guard";

  if (!fullName || !email) await fail("Faltan nombre o email");
  const pwCheck = validatePassword(password);
  if (!pwCheck.ok) await fail(pwCheck.reason);

  const admin = createAdminClient();

  // ¿Ya existe un usuario con este email?
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existingUser = existing?.users.find((u) => u.email?.toLowerCase() === email);

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    const { data: alreadyMember } = await admin
      .from("org_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (alreadyMember) await fail(`Ese email ya es ${alreadyMember.role} en este barrio`);
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created?.user) {
      await fail(createErr?.message ?? "No se pudo crear el usuario");
    }
    userId = created!.user!.id;
  }

  const { error: memberErr } = await admin.from("org_members").insert({
    organization_id: orgId,
    user_id: userId,
    role: targetRole,
  });
  if (memberErr) await fail(memberErr.message);

  await logAudit({
    orgId,
    userId: actorId,
    action: "guard.create",
    entityType: "user",
    entityId: userId,
    metadata: { email, full_name: fullName, role: targetRole },
  });

  revalidatePath(back);
  redirect(`${back}?created=1`);
}

export async function removeGuardAction(formData: FormData) {
  const { orgId, userId: actorId, isLead } = await requireGuardManager();
  const back = await returnPath();
  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) return;

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("org_members")
    .select("user_id, role")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!member) return;

  // Un jefe de guardia solo puede dar de baja role='guard', nunca 'guard_lead'
  if (isLead && member.role !== "guard") {
    await fail("Solo el admin del barrio puede dar de baja a un jefe de guardia");
  }

  await admin
    .from("org_members")
    .delete()
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .in("role", ["guard", "guard_lead"]);

  await logAudit({
    orgId,
    userId: actorId,
    action: "guard.remove",
    entityType: "user",
    entityId: member.user_id,
    metadata: { role: member.role },
  });

  revalidatePath(back);
}
