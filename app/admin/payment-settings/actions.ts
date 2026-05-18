"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";

function fail(msg: string): never {
  redirect(`/admin/payment-settings?error=${encodeURIComponent(msg)}`);
}

export async function savePaymentSettingsAction(formData: FormData) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") throw new Error("Solo el admin puede modificar pagos");

  const tokenInput = String(formData.get("mp_access_token") ?? "").trim();
  const publicKey = String(formData.get("mp_public_key") ?? "").trim();
  const notifyEmails = String(formData.get("notify_emails") ?? "").trim() || null;
  const active = formData.get("active") === "on";

  if (publicKey && !publicKey.startsWith("APP_USR-") && !publicKey.startsWith("TEST-")) {
    fail("Public Key inválida (debe empezar con APP_USR- o TEST-)");
  }
  if (tokenInput && !tokenInput.startsWith("APP_USR-") && !tokenInput.startsWith("TEST-")) {
    fail("Access Token inválido (debe empezar con APP_USR- o TEST-)");
  }

  const admin = createAdminClient();

  // ¿Existe ya un registro?
  const { data: existing } = await admin
    .from("org_payment_settings")
    .select("mp_access_token")
    .eq("organization_id", org.id)
    .maybeSingle();

  // Si el usuario dejó vacío el token, mantenemos el actual
  const tokenToSave = tokenInput || existing?.mp_access_token || null;

  if (active && !tokenToSave) {
    fail("Para activar los cobros tenés que cargar primero el Access Token");
  }

  const { error } = await admin.from("org_payment_settings").upsert(
    {
      organization_id: org.id,
      mp_access_token: tokenToSave,
      mp_public_key: publicKey || null,
      notify_emails: notifyEmails,
      active,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );

  if (error) fail(error.message);

  revalidatePath("/admin/payment-settings");
  redirect("/admin/payment-settings?saved=1");
}
