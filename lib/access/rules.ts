// Evaluación de reglas horarias por categoría.
//
// Se evalúan en HORA LOCAL del servidor/cliente. Asumimos que el barrio
// trabaja en una sola zona horaria (la del país donde está). Si en el
// futuro hay barrios en varias zonas, agregar una timezone por org.

export type AccessRule = {
  kind: string;
  weekday_mask: number;
  start_hour: number;
  end_hour: number;
  enabled: boolean;
};

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Devuelve true si la fecha cae dentro de la ventana permitida por la regla.
export function isWithinAccessWindow(rule: AccessRule, date: Date = new Date()): boolean {
  if (!rule.enabled) return true; // regla deshabilitada → siempre permitido

  const dow = date.getDay(); // 0 = domingo
  const mask = 1 << dow;
  if ((rule.weekday_mask & mask) === 0) return false; // día no permitido

  const hour = date.getHours();
  const { start_hour, end_hour } = rule;

  if (start_hour === end_hour) return true; // ventana de 24h

  if (start_hour < end_hour) {
    // Ventana normal (ej: 7-19)
    return hour >= start_hour && hour <= end_hour;
  }

  // Ventana que cruza medianoche (ej: 22-6)
  return hour >= start_hour || hour <= end_hour;
}

// Texto humano de la regla para mostrar al admin/guardia.
export function describeRule(rule: AccessRule): string {
  if (!rule.enabled) return "Regla deshabilitada";
  const days = describeWeekdayMask(rule.weekday_mask);
  const hours =
    rule.start_hour === rule.end_hour
      ? "24h"
      : `${String(rule.start_hour).padStart(2, "0")}:00 a ${String(rule.end_hour).padStart(2, "0")}:59`;
  return `${days} · ${hours}`;
}

export function describeWeekdayMask(mask: number): string {
  if (mask === 127) return "Todos los días";
  if (mask === 62) return "Lun-Vie";   // 0b0111110
  if (mask === 65) return "Sáb-Dom";   // 0b1000001
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) days.push(DAYS[i]);
  }
  return days.join(", ") || "Ningún día";
}
