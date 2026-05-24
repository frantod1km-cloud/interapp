import { createClient } from "@/lib/supabase/server";
import { dniSearchForms } from "@/lib/dni/parse";
import { describeRule, isWithinAccessWindow, type AccessRule } from "./rules";

export type VehicleHint = {
  plate: string;
  make?: string | null;
  model?: string | null;
  color?: string | null;
};

export type ReservationHint = {
  id: string;
  listing_name: string;
  listing_kind: string;
  starts_at: string;
  ends_at: string;
  status: string; // confirmed | pending_payment
};

export type LastEventHint = {
  occurred_at: string;
  direction: "in" | "out";
  result: string;
};

export type LookupResult =
  | {
      state: "authorized";
      kind: "resident" | "authorization";
      dni: string;
      fullName: string;
      detail: string; // ej: "Lote 42" o "Invitado de Juan Pérez"
      residentId?: string;
      authorizationId?: string;
      vehicles?: VehicleHint[]; // patentes asociadas
      residentKind?: string;    // owner | tenant | family | staff | domestic | contractor
      pendingPackages?: number; // paquetes esperando que retire
      reservations?: ReservationHint[]; // reservas activas / próximas hoy
      lastEvent?: LastEventHint | null; // último ingreso/egreso registrado
      unitId?: string | null;   // id de la unidad del residente (si tiene)
      unitLabel?: string | null;// label de esa unidad para display rápido
    }
  | {
      state: "expired";
      dni: string;
      fullName?: string;
      detail: string; // ej: "Autorización venció a las 18:00"
      authorizationId: string;
    }
  | {
      state: "out_of_window";
      dni: string;
      fullName: string;
      detail: string; // "Fuera del horario habitual (Lun-Vie 7-19)"
      residentId: string;
      residentKind: string;
      vehicles?: VehicleHint[];
    }
  | {
      state: "access_expired";
      dni: string;
      fullName: string;
      detail: string; // "Acceso vencido el 30/06/2026"
      residentId: string;
      residentKind: string;
    }
  | {
      state: "unknown";
      dni: string;
      detail: string; // "DNI no figura en el padrón"
    };

// Resuelve qué estado mostrar al guardia para un DNI dado dentro de una org.
// Prioridad:
//   1. Si el DNI corresponde a un residente activo → AUTORIZADO (verde).
//   2. Si hay una autorización vigente → AUTORIZADO (verde).
//   3. Si hay una autorización vencida o revocada → AMARILLO.
//   4. Si no aparece en ningún lado → AMARILLO (desconocido).
//
// El guardia siempre puede forzar el ingreso, pero el color en pantalla refleja
// el estado real del padrón para que no tenga que pensar.
export async function lookupDni(
  organizationId: string,
  dni: string,
): Promise<LookupResult> {
  const supabase = await createClient();

  // Buscamos por todas las formas plausibles del DNI (con y sin ceros
  // adelante) para ser tolerantes a datos viejos del padrón.
  const dniForms = dniSearchForms(dni);

  // 1. ¿Es residente activo?
  const { data: residents } = await supabase
    .from("residents")
    .select("id, first_name, last_name, unit, unit_id, kind, weekday_mask, start_hour, end_hour, rule_enabled, access_expires_at")
    .eq("organization_id", organizationId)
    .in("dni", dniForms)
    .eq("active", true)
    .limit(1);
  const resident = residents?.[0] ?? null;

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
    // Si la persona tiene una regla individual habilitada, esa manda.
    // Si no tiene regla individual y es staff (empleado del barrio), caemos
    // al fallback global de access_rules para staff. Para owner/tenant/family
    // sin regla individual no hay restricción.
    const needsCategoryRule = !resident.rule_enabled && resident.kind === "staff";

    // Ventana para "reservas relevantes hoy": desde 1h atrás hasta fin del día
    const now = new Date();
    const startOfRelevance = new Date(now.getTime() - 60 * 60_000);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const [
      { data: vehicles },
      { data: categoryRule },
      { count: pendingPackages },
      { data: reservationsData },
      { data: lastEventData },
    ] = await Promise.all([
      supabase
        .from("vehicles")
        .select("plate, make, model, color")
        .eq("organization_id", organizationId)
        .eq("resident_id", resident.id),
      needsCategoryRule
        ? supabase
            .from("access_rules")
            .select("kind, weekday_mask, start_hour, end_hour, enabled")
            .eq("organization_id", organizationId)
            .eq("kind", "staff")
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("packages")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("resident_id", resident.id)
        .eq("status", "pending"),
      supabase
        .from("reservations")
        .select("id, starts_at, ends_at, status, listings(name, kind)")
        .eq("organization_id", organizationId)
        .eq("resident_id", resident.id)
        .in("status", ["confirmed", "pending_payment"])
        .gte("ends_at", startOfRelevance.toISOString())
        .lte("starts_at", endOfDay.toISOString())
        .order("starts_at", { ascending: true })
        .limit(5),
      supabase
        .from("access_events")
        .select("occurred_at, direction, result")
        .eq("organization_id", organizationId)
        .in("dni", dniForms)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    type ResRow = {
      id: string;
      starts_at: string;
      ends_at: string;
      status: string;
      listings: { name: string; kind: string } | { name: string; kind: string }[] | null;
    };
    const reservations: ReservationHint[] = ((reservationsData ?? []) as ResRow[]).map((r) => {
      const l = Array.isArray(r.listings) ? r.listings[0] : r.listings;
      return {
        id: r.id,
        listing_name: l?.name ?? "Reserva",
        listing_kind: l?.kind ?? "space",
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        status: r.status,
      };
    });
    const lastEvent: LastEventHint | null = lastEventData
      ? {
          occurred_at: lastEventData.occurred_at,
          direction: lastEventData.direction as "in" | "out",
          result: lastEventData.result,
        }
      : null;

    // Construir la regla efectiva: individual > categoría (solo staff)
    const effectiveRule: AccessRule | null = resident.rule_enabled
      ? {
          kind: resident.kind,
          weekday_mask: resident.weekday_mask,
          start_hour: resident.start_hour,
          end_hour: resident.end_hour,
          enabled: true,
        }
      : (categoryRule as AccessRule | null);

    if (effectiveRule && !isWithinAccessWindow(effectiveRule)) {
      return {
        state: "out_of_window",
        dni,
        fullName,
        detail: `Fuera del horario habitual (${describeRule(effectiveRule)})`,
        residentId: resident.id,
        residentKind: resident.kind,
        vehicles: vehicles ?? [],
      };
    }

    return {
      state: "authorized",
      kind: "resident",
      dni,
      fullName,
      detail: resident.unit ? resident.unit : "Acceso permanente",
      residentId: resident.id,
      vehicles: vehicles ?? [],
      residentKind: resident.kind,
      pendingPackages: pendingPackages ?? 0,
      reservations,
      lastEvent,
      unitId: resident.unit_id ?? null,
      unitLabel: resident.unit ?? null,
    };
  }

  // 2. ¿Tiene autorización vigente?
  const nowIso = new Date().toISOString();
  const { data: auths } = await supabase
    .from("authorizations")
    .select("id, visitor_name, valid_until, revoked, resident_id, residents(first_name, last_name, unit, unit_id)")
    .eq("organization_id", organizationId)
    .in("dni", dniForms)
    .eq("revoked", false)
    .gte("valid_until", nowIso)
    .order("valid_until", { ascending: false })
    .limit(1);

  const valid = auths?.[0];
  if (valid) {
    const r = Array.isArray(valid.residents) ? valid.residents[0] : valid.residents;
    const host = r ? `${r.first_name} ${r.last_name}` : "Residente";
    const hostUnitId = r && "unit_id" in r ? (r as { unit_id: string | null }).unit_id : null;
    const hostUnitLabel = r && "unit" in r ? (r as { unit: string | null }).unit : null;

    // Último ingreso del visitante (útil para que el guardia sepa si ya entró)
    const { data: lastEv } = await supabase
      .from("access_events")
      .select("occurred_at, direction, result")
      .eq("organization_id", organizationId)
      .in("dni", dniForms)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      state: "authorized",
      kind: "authorization",
      dni,
      fullName: valid.visitor_name ?? "Visitante",
      detail: `Invitado de ${host}`,
      residentId: valid.resident_id,
      authorizationId: valid.id,
      lastEvent: lastEv
        ? { occurred_at: lastEv.occurred_at, direction: lastEv.direction as "in" | "out", result: lastEv.result }
        : null,
      unitId: hostUnitId,
      unitLabel: hostUnitLabel,
    };
  }

  // 3. ¿Hay alguna autorización vencida?
  const { data: expiredList } = await supabase
    .from("authorizations")
    .select("id, visitor_name, valid_until")
    .eq("organization_id", organizationId)
    .in("dni", dniForms)
    .order("valid_until", { ascending: false })
    .limit(1);

  const expired = expiredList?.[0];
  if (expired) {
    const venc = new Date(expired.valid_until);
    return {
      state: "expired",
      dni,
      fullName: expired.visitor_name ?? undefined,
      detail: `Autorización vencida (${venc.toLocaleString("es-AR")})`,
      authorizationId: expired.id,
    };
  }

  // 4. DNI desconocido
  return {
    state: "unknown",
    dni,
    detail: "DNI no figura en el padrón",
  };
}
