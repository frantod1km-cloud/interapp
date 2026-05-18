"use client";

import { useRef, useState, useTransition } from "react";
import { kindMeta } from "@/lib/resident-kinds";
import { formatDni } from "@/lib/dni/parse";
import { createPackageAction, uploadPackagePhotoAction } from "@/app/admin/packages/actions";

type Resident = {
  id: string;
  dni: string;
  first_name: string;
  last_name: string;
  unit: string | null;
  kind: string;
};

type Gate = { id: string; name: string };

const COURIERS = [
  "Mercado Libre",
  "OCA",
  "Correo Argentino",
  "Andreani",
  "Pedidos Ya",
  "Rappi",
  "Delivery",
  "Otro",
];

// Persistencia local de la garita elegida (igual que en GuardScreen)
const GATE_LS_KEY = "interapp.guard.gate";

export default function PackageForm({
  residents,
  gates,
}: {
  residents: Resident[];
  gates: Gate[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Resident | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  // Filtrado simple por DNI, nombre o unidad
  const q = query.toLowerCase().trim();
  const filtered = q
    ? residents
        .filter((r) => {
          const hay = `${r.dni} ${r.first_name} ${r.last_name} ${r.unit ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
        .slice(0, 8)
    : [];

  // Garita actual del dispositivo
  const gateId = typeof window !== "undefined" ? localStorage.getItem(GATE_LS_KEY) : null;
  const gateLabel = gates.find((g) => g.id === gateId)?.name ?? "";

  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { url } = await uploadPackagePhotoAction(fd);
      setPhotoUrl(url);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Error subiendo foto");
    } finally {
      setPhotoBusy(false);
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!selected) {
      e.preventDefault();
      alert("Elegí el residente destinatario");
      return;
    }
    // dejamos que el form siga su acción
  };

  return (
    <form action={createPackageAction} onSubmit={onSubmit} className="space-y-4">
      {/* Selector de residente */}
      <div>
        <label className="block text-sm mb-1 text-zinc-700">¿Para quién es?</label>
        {selected ? (
          <div className="bg-white border border-emerald-700/40 rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="font-semibold">
                {kindMeta(selected.kind).emoji} {selected.last_name}, {selected.first_name}
              </div>
              <div className="text-xs text-zinc-700">
                DNI {formatDni(selected.dni)} {selected.unit && `· ${selected.unit}`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setQuery("");
              }}
              className="text-xs text-zinc-700 hover:text-zinc-900 underline"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, DNI o unidad…"
              autoComplete="off"
              className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3"
            />
            {filtered.length > 0 && (
              <ul className="mt-2 bg-white border border-zinc-200 rounded-lg divide-y divide-zinc-800 max-h-72 overflow-y-auto">
                {filtered.map((r) => {
                  const km = kindMeta(r.kind);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(r);
                          setQuery("");
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-white border border-zinc-200 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-medium">
                            {km.emoji} {r.last_name}, {r.first_name}
                          </div>
                          <div className="text-xs text-zinc-700">
                            DNI {formatDni(r.dni)} {r.unit && `· ${r.unit}`}
                          </div>
                        </div>
                        <span className="text-xs text-zinc-700">Elegir →</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {q && filtered.length === 0 && (
              <p className="text-xs text-zinc-700 mt-2">Sin resultados.</p>
            )}
          </>
        )}
        <input type="hidden" name="resident_id" value={selected?.id ?? ""} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm mb-1 text-zinc-700">Descripción</label>
          <input
            name="description"
            required
            placeholder='Ej: "Caja chica Mercado Libre"'
            className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3"
          />
        </div>
        <div>
          <label className="block text-sm mb-1 text-zinc-700">Mensajería</label>
          <select
            name="courier"
            defaultValue=""
            className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3"
          >
            <option value="">— (opcional) —</option>
            {COURIERS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Foto opcional con cámara */}
      <div>
        <label className="block text-sm mb-1 text-zinc-700">Foto del paquete (opcional)</label>
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="" className="w-20 h-20 rounded-lg object-cover bg-zinc-100" />
              <button
                type="button"
                onClick={() => {
                  setPhotoUrl(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-sm text-zinc-700 hover:text-rose-700"
              >
                Quitar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoBusy}
                className="bg-zinc-100 hover:bg-zinc-200 px-4 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {photoBusy ? "Subiendo…" : "📷 Sacar foto"}
              </button>
              <span className="text-xs text-zinc-700">JPG / PNG / WEBP · máx 5MB</span>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={onPhotoChange}
            className="hidden"
          />
        </div>
        {photoError && <p className="text-rose-700 text-xs mt-1">{photoError}</p>}
        <input type="hidden" name="photo_url" value={photoUrl ?? ""} />
      </div>

      <input type="hidden" name="gate_id" value={gateId ?? ""} />
      <input type="hidden" name="gate_label" value={gateLabel} />

      <button
        type="submit"
        disabled={!selected || photoBusy || pending}
        className="w-full bg-blue-600 hover:bg-blue-500 font-semibold py-3 rounded-xl disabled:opacity-50"
      >
        Registrar paquete
      </button>
    </form>
  );
}
