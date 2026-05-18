import Link from "next/link";
import { KIND_META, type ListingKind } from "@/lib/marketplace";
import ListingForm from "../ListingForm";

export const dynamic = "force-dynamic";

const ALL_KINDS: ListingKind[] = ["space", "event", "membership"];

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const selectedKind = (ALL_KINDS as string[]).includes(sp.kind ?? "")
    ? (sp.kind as ListingKind)
    : null;

  // Si no eligió tipo, mostramos selector
  if (!selectedKind) {
    return (
      <div>
        <Link href="/admin/marketplace" className="text-sm text-zinc-700 hover:text-zinc-700 inline-block mb-4">
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold mb-2">¿Qué querés crear?</h1>
        <p className="text-zinc-700 text-sm mb-6">
          Cada tipo tiene su propio flujo de reserva y pago.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ALL_KINDS.map((k) => {
            const m = KIND_META[k];
            return (
              <Link
                key={k}
                href={`/admin/marketplace/new?kind=${k}`}
                className="bg-white border border-zinc-200 rounded-2xl p-6 hover:border-emerald-500/50 transition"
              >
                <div className="text-5xl mb-3">{m.emoji}</div>
                <h3 className="font-bold mb-1">{m.label}</h3>
                <p className="text-sm text-zinc-700">{m.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/admin/marketplace/new" className="text-sm text-zinc-700 hover:text-zinc-700 inline-block mb-4">
        ← Cambiar tipo
      </Link>
      <h1 className="text-2xl font-bold mb-2">
        {KIND_META[selectedKind].emoji} Nuevo {KIND_META[selectedKind].label.toLowerCase()}
      </h1>
      <p className="text-zinc-700 text-sm mb-6">{KIND_META[selectedKind].description}</p>

      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-700">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <ListingForm kind={selectedKind} mode="create" />
    </div>
  );
}
