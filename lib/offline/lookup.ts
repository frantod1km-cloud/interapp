import type { LookupResult } from "@/lib/access/lookup";
import { describeRule, isWithinAccessWindow } from "@/lib/access/rules";
import type { Snapshot } from "./db";

// Versión cliente del lookup. Misma semántica que `lib/access/lookup.ts`,
// pero trabaja sobre el snapshot cacheado en IndexedDB.

export function lookupDniOffline(snap: Snapshot, dni: string): LookupResult {
  const resident = snap.residents.find((r) => r.dni === dni);
  if (resident) {
    const fullName = `${resident.first_name} ${resident.last_name}`;

    // Expiración tiene prioridad sobre cualquier otra regla
    if (resident.access_expires_at && new Date(resident.access_expires_at) < new Date()) {
      return {
        state: "access_expired",
        dni,
        fullName,
        detail: `Acceso vencido el ${new Date(resident.access_expires_at).toLocaleDateString("es-AR")}`,
        residentId: resident.id,
        residentKind: resident.kind,
      };
    }

    const vehicles = snap.vehicles
      .filter((v) => v.resident_id === resident.id)
      .map((v) => ({ plate: v.plate, make: v.make, model: v.model, color: v.color }));

    // Regla efectiva: individual > categoría (solo staff)
    const personalRule = resident.rule_enabled
      ? {
          kind: resident.kind,
          weekday_mask: resident.weekday_mask,
          start_hour: resident.start_hour,
          end_hour: resident.end_hour,
          enabled: true,
        }
      : null;
    const categoryRule =
      !personalRule && resident.kind === "staff"
        ? snap.rules?.find((r) => r.kind === "staff")
        : null;
    const effective = personalRule ?? categoryRule ?? null;

    if (effective && !isWithinAccessWindow(effective)) {
      return {
        state: "out_of_window",
        dni,
        fullName,
        detail: `Fuera del horario habitual (${describeRule(effective)})`,
        residentId: resident.id,
        residentKind: resident.kind,
        vehicles,
      };
    }

    return {
      state: "authorized",
      kind: "resident",
      dni,
      fullName,
      detail: resident.unit ? resident.unit : "Acceso permanente",
      residentId: resident.id,
      vehicles,
      residentKind: resident.kind,
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
