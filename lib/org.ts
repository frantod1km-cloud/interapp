import { headers } from "next/headers";
import { createClient } from "./supabase/server";

export type Organization = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  plan: string;
  status: string;
};

// Devuelve la org del request actual a partir del header `x-org-slug` que
// inyecta el middleware. Null si estamos en la raíz (sin subdominio).
export async function getCurrentOrg(): Promise<Organization | null> {
  const h = await headers();
  const slug = h.get("x-org-slug");
  if (!slug) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, slug, name, logo_url, plan, status")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return data as Organization;
}

// Devuelve el rol del usuario actual en la org actual, o null si no es miembro
// (o si no hay sesión).
export async function getCurrentMemberRole(
  organizationId: string,
): Promise<"org_admin" | "guard" | "resident" | "viewer" | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("org_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  return (data?.role as "org_admin" | "guard" | "resident" | "viewer") ?? null;
}
