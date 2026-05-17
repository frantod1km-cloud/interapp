// Helpers para mostrar cuánto hace que llegó un paquete y resaltar visualmente
// cuando lleva mucho tiempo sin retirarse.

export type AgeBadge = {
  label: string;          // "Hoy", "Hace 2 días", "Hace 12 días"
  days: number;
  level: "fresh" | "warning" | "danger"; // fresh = <3 días, warning = 3-6, danger = >=7
  className: string;
};

export function packageAge(receivedAt: string | Date): AgeBadge {
  const date = typeof receivedAt === "string" ? new Date(receivedAt) : receivedAt;
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let label: string;
  if (days === 0) label = "Hoy";
  else if (days === 1) label = "Hace 1 día";
  else label = `Hace ${days} días`;

  let level: AgeBadge["level"];
  let className: string;
  if (days < 3) {
    level = "fresh";
    className = "bg-zinc-700/40 text-zinc-300";
  } else if (days < 7) {
    level = "warning";
    className = "bg-amber-600/20 text-amber-300 border border-amber-600/40";
  } else {
    level = "danger";
    className = "bg-rose-700/20 text-rose-300 border border-rose-600/40";
  }

  return { label, days, level, className };
}
