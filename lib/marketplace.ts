// Tipos y helpers compartidos del marketplace.

export type ListingKind = "space" | "event" | "membership";

export const KIND_META: Record<ListingKind, { label: string; emoji: string; description: string }> = {
  space: {
    label: "Espacio reservable",
    emoji: "🏛️",
    description: "SUM, quincho, pileta, cancha, parrilla — reservas por horario.",
  },
  event: {
    label: "Evento",
    emoji: "🎉",
    description: "Cena, taller, fiesta — fecha fija y cupo limitado.",
  },
  membership: {
    label: "Membresía",
    emoji: "💳",
    description: "Gimnasio, clases recurrentes — cobro mensual automático.",
  },
};

export function formatArs(n: number): string {
  return `$${n.toLocaleString("es-AR")}`;
}
