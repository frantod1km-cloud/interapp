import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { KIND_META, type ListingKind } from "@/lib/marketplace";
import ListingForm from "../../ListingForm";

export const dynamic = "force-dynamic";

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!listing) notFound();

  const meta = KIND_META[listing.kind as ListingKind];

  return (
    <div>
      <Link
        href={`/admin/marketplace/${listing.id}`}
        className="text-sm text-zinc-500 hover:text-zinc-300 inline-block mb-4"
      >
        ← Volver
      </Link>
      <h1 className="text-2xl font-bold mb-2">
        Editar: {meta.emoji} {listing.name}
      </h1>
      <p className="text-zinc-400 text-sm mb-6">{meta.label}</p>

      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <ListingForm kind={listing.kind as ListingKind} mode="edit" existing={listing} />
    </div>
  );
}
