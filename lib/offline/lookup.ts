import type { LookupResult } from "@/lib/access/lookup";
import type { Snapshot } from "./db";

// Versión cliente del lookup. Misma semántica que `lib/access/lookup.ts`,
// pero trabaja sobre el snapshot cacheado en IndexedDB.

export function lookupDniOffline(snap: Snapshot, dni: string): LookupResult {
  const resident = snap.residents.find((r) => r.dni === dni);
  if (resident) {
    const vehicles = snap.vehicles
      .filter((v) => v.resident_id === resident.id)
      .map((v) => ({ plate: v.plate, make: v.make, model: v.model, color: v.color }));
    return {
      state: "authorized",
      kind: "resident",
      dni,
      fullName: `${resident.first_name} ${resident.last_name}`,
      detail: resident.unit ? `Residente — ${resident.unit}` : "Residente",
      residentId: resident.id,
      vehicles,
    };
  }

  const now = Date.now();
  const matching = snap.authorizations.filter((a) => a.dni === dni);
  const valid = matching.find((a) => new Date(a.valid_until).getTime() >= now);
  if (valid) {
    return {
      state: "authorized",
      kind: "authorization",
      dni,
      fullName: valid.visitor_name ?? "Visitante",
      detail: `Invitado de ${valid.resident_name ?? "Residente"}`,
      residentId: valid.resident_id,
      authorizationId: valid.id,
    };
  }

  const expired = matching.sort((a, b) =>
    a.valid_until < b.valid_until ? 1 : -1,
  )[0];
  if (expired) {
    return {
      state: "expired",
      dni,
      fullName: expired.visitor_name ?? undefined,
      detail: `Autorización vencida (${new Date(expired.valid_until).toLocaleString("es-AR")})`,
      authorizationId: expired.id,
    };
  }

  return { state: "unknown", dni, detail: "DNI no figura en el padrón (snapshot offline)" };
}
