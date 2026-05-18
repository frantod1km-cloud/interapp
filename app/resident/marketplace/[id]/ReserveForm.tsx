"use client";

import { useMemo, useState, useTransition } from "react";
import { formatArs } from "@/lib/marketplace";

type Listing = {
  id: string;
  kind: string;
  name: string;
  price_ars: number;
  slot_minutes: number | null;
  max_concurrent: number | null;
  advance_days: number | null;
  open_hour: number | null;
  close_hour: number | null;
  event_starts_at: string | null;
  event_ends_at: string | null;
  event_capacity: number | null;
};

// Form de reserva del residente. Adaptable por kind:
//   - space: elige día + slot horario (validamos contra slots ocupados)
//   - event: elige cantidad de entradas (validamos contra cupo)
//   - membership: 1 click + acepta cobro recurrente

export default function ReserveForm({
  listing,
  occupiedSlots,
  eventVacancy,
}: {
  listing: Listing;
  occupiedSlots: Array<{ starts_at: string; ends_at: string }>;
  eventVacancy: number | null;
}) {
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [hour, setHour] = useState<number>(listing.open_hour ?? 8);
  const [quantity, setQuantity] = useState(1);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const slotMinutes = listing.slot_minutes ?? 60;
  const openHour = listing.open_hour ?? 8;
  const closeHour = listing.close_hour ?? 22;
  const maxConcurrent = listing.max_concurrent ?? 1;

  // Para space: horarios disponibles en el día seleccionado
  const availableHours = useMemo(() => {
    if (listing.kind !== "space") return [];
    const slots: Array<{ hour: number; available: boolean }> = [];
    for (let h = openHour; h < closeHour; h++) {
      const slotStart = new Date(`${date}T${String(h).padStart(2, "0")}:00:00`);
      const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60_000);
      const conflicts = occupiedSlots.filter((o) => {
        const oStart = new Date(o.starts_at);
        const oEnd = new Date(o.ends_at);
        return slotStart < oEnd && slotEnd > oStart;
      }).length;
      const isPast = slotEnd < new Date();
      slots.push({ hour: h, available: !isPast && conflicts < maxConcurrent });
    }
    return slots;
  }, [listing.kind, date, occupiedSlots, openHour, closeHour, slotMinutes, maxConcurrent]);

  const submit = async () => {
    setError(null);
    startTransition(async () => {
      const body: Record<string, unknown> = {
        listing_id: listing.id,
        quantity,
      };
      if (listing.kind === "space") {
        const startsAt = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).toISOString();
        const endsAt = new Date(new Date(startsAt).getTime() + slotMinutes * 60_000).toISOString();
        body.starts_at = startsAt;
        body.ends_at = endsAt;
      }

      try {
        const resp = await fetch("/api/marketplace/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await resp.json();
        if (!resp.ok || !data.init_point) {
          setError(data.error ?? "Error al crear el pago");
          return;
        }
        // Redirect a Mercado Pago
        window.location.href = data.init_point;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de red");
      }
    });
  };

  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + (listing.advance_days ?? 30) * 86400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <h2 className="font-bold">Reservar</h2>

      {/* Space: día + horario */}
      {listing.kind === "space" && (
        <>
          <div>
            <label className="block text-sm mb-1 text-zinc-400">Día</label>
            <input
              type="date"
              value={date}
              min={today}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-zinc-400">
              Horario ({slotMinutes} min por slot)
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {availableHours.map((s) => (
                <button
                  key={s.hour}
                  type="button"
                  disabled={!s.available}
                  onClick={() => setHour(s.hour)}
                  className={`py-2 rounded text-sm font-mono ${
                    !s.available
                      ? "bg-zinc-900 border border-zinc-800 text-zinc-400 line-through cursor-not-allowed"
                      : hour === s.hour
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-800 hover:bg-zinc-700"
                  }`}
                >
                  {String(s.hour).padStart(2, "0")}:00
                </button>
              ))}
            </div>
            {availableHours.every((s) => !s.available) && (
              <p className="text-xs text-amber-300 mt-2">
                No hay slots disponibles este día. Elegí otra fecha.
              </p>
            )}
          </div>
        </>
      )}

      {/* Event: cantidad de entradas */}
      {listing.kind === "event" && (
        <>
          {listing.event_starts_at && (
            <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm">
              📅 {new Date(listing.event_starts_at).toLocaleString("es-AR")}
            </div>
          )}
          {eventVacancy !== null && (
            <div className="text-sm text-zinc-400">
              {eventVacancy > 0 ? (
                <>🎟️ Vacantes disponibles: <strong>{eventVacancy}</strong></>
              ) : (
                <span className="text-rose-300">😢 Sin vacantes — agotado</span>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm mb-1 text-zinc-400">Cantidad de entradas</label>
            <input
              type="number"
              min={1}
              max={eventVacancy ?? 10}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
            />
          </div>
        </>
      )}

      {/* Membership: nada más que confirmar */}
      {listing.kind === "membership" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm">
          Suscripción con cobro automático. Podés cancelar en cualquier momento desde Mercado
          Pago. (Pronto)
        </div>
      )}

      <div className="border-t border-zinc-800 pt-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-zinc-400">Total a pagar</div>
          <div className="text-2xl font-bold text-emerald-400">
            {formatArs(listing.price_ars * quantity)}
          </div>
        </div>
      </div>

      {error && <p className="text-rose-300 text-sm">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={
          busy ||
          (listing.kind === "membership") ||
          (listing.kind === "space" && availableHours.find((s) => s.hour === hour)?.available !== true) ||
          (listing.kind === "event" && eventVacancy !== null && eventVacancy < quantity)
        }
        className="w-full bg-emerald-600 hover:bg-emerald-500 font-semibold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy
          ? "Redirigiendo a Mercado Pago…"
          : listing.kind === "membership"
            ? "Membresías próximamente"
            : "💳 Reservar y pagar"}
      </button>
    </div>
  );
}
