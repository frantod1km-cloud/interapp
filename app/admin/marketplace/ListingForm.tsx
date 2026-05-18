"use client";

import { useRef, useState } from "react";
import type { ListingKind } from "@/lib/marketplace";
import { createListingAction, updateListingAction, uploadListingPhotoAction } from "./actions";

type Existing = {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  price_ars: number;
  active: boolean;
  slot_minutes: number | null;
  max_concurrent: number | null;
  advance_days: number | null;
  open_hour: number | null;
  close_hour: number | null;
  event_starts_at: string | null;
  event_ends_at: string | null;
  event_capacity: number | null;
  membership_months: number | null;
};

export default function ListingForm({
  kind,
  mode,
  existing,
}: {
  kind: ListingKind;
  mode: "create" | "edit";
  existing?: Existing;
}) {
  const [photoUrl, setPhotoUrl] = useState(existing?.photo_url ?? "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const action = mode === "create" ? createListingAction : updateListingAction;

  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { url } = await uploadListingPhotoAction(fd);
      setPhotoUrl(url);
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <form action={action} className="space-y-4">
      {mode === "edit" && existing && <input type="hidden" name="id" value={existing.id} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="photo_url" value={photoUrl} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-sm mb-1 text-zinc-700">Nombre</label>
          <input
            name="name"
            required
            defaultValue={existing?.name}
            placeholder={
              kind === "space"
                ? "Ej: SUM, Pileta, Cancha de tenis"
                : kind === "event"
                  ? "Ej: Cena de fin de año"
                  : "Ej: Membresía gimnasio mensual"
            }
            className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm mb-1 text-zinc-700">Descripción</label>
          <textarea
            name="description"
            rows={3}
            defaultValue={existing?.description ?? ""}
            placeholder="Detalles, reglas de uso, qué incluye..."
            className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3"
          />
        </div>

        <div>
          <label className="block text-sm mb-1 text-zinc-700">Precio (ARS)</label>
          <input
            name="price_ars"
            type="number"
            min={0}
            step={100}
            required
            defaultValue={existing?.price_ars ?? 0}
            className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3"
          />
          <p className="text-xs text-zinc-700 mt-1">
            {kind === "space"
              ? "Por slot reservado"
              : kind === "event"
                ? "Por entrada"
                : "Mensual"}
          </p>
        </div>

        {mode === "edit" && (
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="active"
                defaultChecked={existing?.active ?? true}
                className="w-4 h-4"
              />
              <span>Activo (visible para residentes)</span>
            </label>
          </div>
        )}
      </div>

      {/* Foto */}
      <div>
        <label className="block text-sm mb-1 text-zinc-700">Foto</label>
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="" className="w-24 h-24 rounded-lg object-cover bg-zinc-100" />
              <button
                type="button"
                onClick={() => {
                  setPhotoUrl("");
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-sm text-zinc-700 hover:text-rose-700"
              >
                Quitar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoBusy}
              className="bg-zinc-100 hover:bg-zinc-200 px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {photoBusy ? "Subiendo…" : "📷 Subir foto"}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPhotoChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Campos específicos por kind */}
      {kind === "space" && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-sm">⏱️ Reservas por horario</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-700 mb-1">Duración del slot (min)</label>
              <input
                name="slot_minutes"
                type="number"
                min={15}
                step={15}
                defaultValue={existing?.slot_minutes ?? 60}
                className="w-full bg-white border border-zinc-200 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-700 mb-1">Cupo simultáneo</label>
              <input
                name="max_concurrent"
                type="number"
                min={1}
                defaultValue={existing?.max_concurrent ?? 1}
                className="w-full bg-white border border-zinc-200 rounded px-3 py-2 text-sm"
              />
              <p className="text-xs text-zinc-700 mt-0.5">1 = uso exclusivo</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-700 mb-1">Días para reservar</label>
              <input
                name="advance_days"
                type="number"
                min={1}
                max={365}
                defaultValue={existing?.advance_days ?? 30}
                className="w-full bg-white border border-zinc-200 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-700 mb-1">Abre a las</label>
              <select
                name="open_hour"
                defaultValue={existing?.open_hour ?? 8}
                className="w-full bg-white border border-zinc-200 rounded px-3 py-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-700 mb-1">Cierra a las</label>
              <select
                name="close_hour"
                defaultValue={existing?.close_hour ?? 22}
                className="w-full bg-white border border-zinc-200 rounded px-3 py-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {kind === "event" && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-sm">🎉 Evento puntual</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-700 mb-1">Inicio</label>
              <input
                name="event_starts_at"
                type="datetime-local"
                required
                defaultValue={
                  existing?.event_starts_at
                    ? new Date(existing.event_starts_at).toISOString().slice(0, 16)
                    : ""
                }
                className="w-full bg-white border border-zinc-200 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-700 mb-1">Fin (opcional)</label>
              <input
                name="event_ends_at"
                type="datetime-local"
                defaultValue={
                  existing?.event_ends_at
                    ? new Date(existing.event_ends_at).toISOString().slice(0, 16)
                    : ""
                }
                className="w-full bg-white border border-zinc-200 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-700 mb-1">Cupo total (opcional)</label>
              <input
                name="event_capacity"
                type="number"
                min={1}
                defaultValue={existing?.event_capacity ?? ""}
                placeholder="Sin límite"
                className="w-full bg-white border border-zinc-200 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {kind === "membership" && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-sm">💳 Membresía recurrente</h3>
          <div>
            <label className="block text-xs text-zinc-700 mb-1">Duración del período</label>
            <select
              name="membership_months"
              defaultValue={existing?.membership_months ?? 1}
              className="w-full bg-white border border-zinc-200 rounded px-3 py-2 text-sm"
            >
              <option value={1}>Mensual</option>
              <option value={3}>Trimestral</option>
              <option value={6}>Semestral</option>
              <option value={12}>Anual</option>
            </select>
            <p className="text-xs text-zinc-700 mt-1">
              Cobro recurrente automático con Mercado Pago.
            </p>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={photoBusy}
        className="w-full bg-blue-600 hover:bg-blue-500 font-semibold py-3 rounded-xl disabled:opacity-50"
      >
        {mode === "create" ? "Crear" : "Guardar cambios"}
      </button>
    </form>
  );
}
