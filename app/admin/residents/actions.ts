"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";

export async function addResidentAction(formData: FormData) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");

  const dni = String(formData.get("dni") ?? "").replace(/\D/g, "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim() || null;

  if (!dni || !firstName || !lastName) {
    throw new Error("DNI, nombre y apellido son obligatorios.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("residents").insert({
    organization_id: org.id,
    dni,
    first_name: firstName,
    last_name: lastName,
    unit,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/residents");
}
