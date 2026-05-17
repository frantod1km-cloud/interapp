import { createClient } from "@/lib/supabase/server";
import { describeRule, isWithinAccessWindow, type AccessRule } from "./rules";

export type VehicleHint = {
  plate: string;
  make?: string | null;
  model?: string | null;
  color?: string | null;
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

  // 1. ¿Es residente activo?
  const { data: resident } = await supabase
    .from("residents")
    .select("id, first_name, last_name, unit, kind, weekday_mask, start_hour, end_hour, rule_enabled")
    .eq("organization_id", organizationId)
    .eq("dni", dni)
    .eq("active", true)
    .maybeSingle();

  if (resident) {
    // Si la persona tiene una regla individual habilitada, esa manda.
    // Si no tiene regla individual y es staff (empleado del barrio), caemos
    // al fallback global de access_rules para staff. Para owner/tenant/family
    // sin regla individual no hay restricción.
    const needsCategoryRule = !resident.rule_enabled && resident.kind === "staff";

    const [{ data: vehicles }, { data: categoryRule }, { count: pendingPackages }] = await Promise.all([
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
    ]);

    const fullName = `${resident.first_name} ${resident.last_name}`;

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
    };
  }

  // 2. ¿Tiene autorización vigente?
  const nowIso = new Date().toISOString();
  const { data: auths } = await supabase
    .from("authorizations")
    .select("id, visitor_name, valid_until, revoked, resident_id, residents(first_name, last_name)")
    .eq("organization_id", organizationId)
    .eq("dni", dni)
    .eq("revoked", false)
    .gte("valid_until", nowIso)
    .order("valid_until", { ascending: false })
    .limit(1);

  const valid = auths?.[0];
  if (valid) {
    const r = Array.isArray(valid.residents) ? valid.residents[0] : valid.residents;
    const host = r ? `${r.first_name} ${r.last_name}` : "Residente";
    return {
      state: "authorized",
      kind: "authorization",
      dni,
      fullName: valid.visitor_name ?? "Visitante",
      detail: `Invitado de ${host}`,
      residentId: valid.resident_id,
      authorizationId: valid.id,
    };
  }

  // 3. ¿Hay alguna autorización vencida?
  const { data: expiredList } = await supabase
    .from("authorizations")
    .select("id, visitor_name, valid_until")
    .eq("organization_id", organizationId)
    .eq("dni", dni)
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
