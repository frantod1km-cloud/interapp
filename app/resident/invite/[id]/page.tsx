import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import ShareInvite from "./ShareInvite";

export const dynamic = "force-dynamic";

export default async function InviteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();
  const { data: auth } = await supabase
    .from("authorizations")
    .select("id, invite_token, claimed_at, dni, visitor_name, valid_until, notes")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!auth) notFound();

  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = host.includes("localhost") ? "http" : "https";
  const url = auth.invite_token ? `${proto}://${host}/v/${auth.invite_token}` : null;

  return (
    <div>
      <Link href="/resident" className="text-sm text-zinc-400 hover:text-zinc-400 mb-4 inline-block">
        ← Volver
      </Link>
      <h1 className="text-2xl font-bold mb-2">Link de invitación</h1>
      {auth.claimed_at ? (
        <p className="text-sm text-emerald-400 mb-6">
          Ya fue usado por {auth.visitor_name ?? "el invitado"}.
        </p>
      ) : (
        <p className="text-sm text-zinc-400 mb-6">
          Compartile este link al invitado. Caduca el{" "}
          {new Date(auth.valid_until).toLocaleString("es-AR")}.
        </p>
      )}
      {url && !auth.claimed_at && <ShareInvite url={url} />}
    </div>
  );
}
