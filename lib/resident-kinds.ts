// Categorías de residentes — solo informativo, no cambia permisos.
// Si cambiás esto, también actualizar el CHECK constraint en
// supabase/migrations/0007_roles_and_kinds.sql.

export type ResidentKind =
  | "owner"
  | "tenant"
  | "family"
  | "staff"
  | "domestic"
  | "contractor";

export const RESIDENT_KINDS: Array<{
  id: ResidentKind;
  label: string;
  short: string;
  emoji: string;
  className: string;
}> = [
  { id: "owner", label: "Propietario", short: "Propietario", emoji: "🏠", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { id: "tenant", label: "Inquilino", short: "Inquilino", emoji: "🔑", className: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  { id: "family", label: "Familiar", short: "Familiar", emoji: "👨‍👩‍👧", className: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  { id: "staff", label: "Empleado del barrio", short: "Empleado", emoji: "🛠️", className: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { id: "domestic", label: "Empleada doméstica fija", short: "Doméstica", emoji: "🧹", className: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  { id: "contractor", label: "Proveedor recurrente", short: "Proveedor", emoji: "🚚", className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" },
];

export function kindMeta(id: string | null | undefined) {
  return RESIDENT_KINDS.find((k) => k.id === id) ?? RESIDENT_KINDS[0];
}
