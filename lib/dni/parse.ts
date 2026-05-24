// Parser del PDF417 del DNI argentino.
//
// El lector tipo pistola se comporta como teclado HID: lee el código de barras
// y "tipea" los campos separados por comilla doble (").
// El último carácter suele ser un retorno de carro (Enter) que dispara el
// submit del form.
//
// Formato real (ejemplo del DNI nuevo, 9 campos):
//   00653769610"BARROS"MIRIAM EDITH"F"14498088"D"16-07-1961"23-03-2021"279
//
// Campos:
//   0: número de trámite (11 dígitos)
//   1: apellido(s)
//   2: nombre(s)
//   3: sexo (M / F / X)
//   4: DNI (8 dígitos)
//   5: ejemplar (A, B, C, D, ...)
//   6: fecha de nacimiento (DD-MM-YYYY)
//   7: fecha de emisión (DD-MM-YYYY)
//   8: código de verificación
//
// Formato viejo (sin el número de trámite al inicio): el apellido viene primero.
//
// Algunos lectores configurados con scripts viejos podrían usar @ como
// separador en lugar de ". Soportamos ambos.

export type ParsedDni = {
  dni: string;
  firstName?: string;
  lastName?: string;
  sex?: "M" | "F" | "X";
  birthDate?: string; // ISO yyyy-mm-dd
  raw: string;
  source: "scanner" | "manual";
};

// Aceptamos fechas DD-MM-YYYY (formato real del DNI argentino) y DD/MM/YYYY
// por compatibilidad histórica.
const DATE_RE = /^(\d{2})[-/](\d{2})[-/](\d{4})$/;

function dateToIso(s: string): string | undefined {
  const m = s.trim().match(DATE_RE);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Forma canónica de un DNI argentino: 8 dígitos con cero a la izquierda.
 *
 * Por qué:
 *   - Los DNI viejos (gente mayor) son de 7 dígitos.
 *   - Los lectores PDF417 los devuelven tal cual (7 dígitos).
 *   - Los admins suelen tipearlos rellenados a 8 (Excel, padrón viejo).
 *   - Si normalizamos a una sola forma, el lookup funciona siempre.
 *
 * Reglas:
 *   - <= 8 dígitos → padeamos con ceros a la izquierda hasta 8.
 *   - 9+ dígitos (extranjeros, IDs raros) → se respeta tal cual.
 *   - El input vacío o todo no-dígitos → "".
 */
export function normalizeDni(s: string | null | undefined): string {
  if (!s) return "";
  const onlyDigits = String(s).replace(/[^\d]/g, "");
  if (!onlyDigits) return "";
  // Sacar ceros a la izquierda para medir el "tamaño real"
  const stripped = onlyDigits.replace(/^0+/, "") || "0";
  // <= 8 dígitos: forma canónica argentina (8 con padding)
  if (stripped.length <= 8) return stripped.padStart(8, "0");
  // 9+ dígitos: se devuelve como viene (sin ceros sobrantes)
  return stripped;
}

function normalizeDniDigits(s: string): string {
  return normalizeDni(s);
}

/**
 * Devuelve true si el input parece ser un scan PDF417 (tiene comillas o @ como
 * separador). Útil para distinguir "está escaneando" de "está tipeando manual".
 */
export function looksLikeScannerInput(s: string): boolean {
  return s.includes('"') || s.includes("@");
}

export function parseDni(input: string): ParsedDni | null {
  const raw = input.trim();
  if (!raw) return null;

  // Caso 1: input contiene " o @ → es scan PDF417.
  // El separador real es ", pero por compat aceptamos también @.
  if (looksLikeScannerInput(raw)) {
    const sep = raw.includes('"') ? '"' : "@";
    const parts = raw.split(sep).map((p) => p.trim());

    // Necesitamos al menos 5 campos para tener acceso al DNI (formato viejo)
    // o 6 (formato nuevo). Si hay menos, el scan está incompleto.
    if (parts.length < 5) return null;

    // Heurística: si el primer campo es solo dígitos y largo (>= 8), es el
    // número de trámite (formato nuevo). Si es texto, formato viejo.
    const isNew = /^\d{8,}$/.test(parts[0]);
    const offset = isNew ? 1 : 0;

    const lastName = parts[offset];
    const firstName = parts[offset + 1];
    const sexChar = (parts[offset + 2] || "").toUpperCase();
    const dniDigits = normalizeDniDigits(parts[offset + 3] || "");
    // En el formato nuevo:
    //   parts[offset+4] = ejemplar (D)
    //   parts[offset+5] = fecha nacimiento
    // En el formato viejo:
    //   parts[offset+4] = ejemplar
    //   parts[offset+5] = fecha nacimiento (mismo offset relativo)
    const birthRaw = parts[offset + 5] || "";

    // dniDigits ya viene padeado a 8 (forma canónica) por normalizeDni.
    // Aceptamos cualquier valor con al menos 7 dígitos "reales".
    if (!dniDigits || dniDigits.replace(/^0+/, "").length < 6) return null;

    return {
      dni: dniDigits,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      sex:
        sexChar === "M" || sexChar === "F" || sexChar === "X"
          ? (sexChar as "M" | "F" | "X")
          : undefined,
      birthDate: dateToIso(birthRaw),
      raw,
      source: "scanner",
    };
  }

  // Caso 2: input son solo dígitos (tipeo manual). La normalización deja
  // siempre 8 dígitos para DNI argentinos (paddea con ceros). Aceptamos
  // entre 7 y 9 dígitos "reales" para cubrir DNI nuevos, DNI viejos y
  // documentos de extranjeros.
  const digits = normalizeDniDigits(raw);
  const realLen = digits.replace(/^0+/, "").length || digits.length;
  if (realLen >= 6 && digits.length <= 10) {
    return { dni: digits, raw, source: "manual" };
  }

  return null;
}

// Formato display: 12.345.678
export function formatDni(dni: string): string {
  const digits = dni.replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
