// Parser del PDF417 del DNI argentino.
//
// El lector tipo pistola se comporta como teclado HID: lee el código de barras
// y "tipea" los campos separados por `@`. El último carácter suele ser un
// retorno de carro (Enter) que dispara el submit del form.
//
// Formato típico (DNI nuevo, 17 campos):
//   00000000 @ APELLIDO @ NOMBRE @ M @ 12345678 @ A @ DD/MM/YYYY @ DD/MM/YYYY @ ...
//
// Formato viejo (15 campos, sin el primer trámite):
//   APELLIDO @ NOMBRE @ M @ 12345678 @ A @ DD/MM/YYYY @ ...
//
// Devolvemos lo que necesitamos para el flujo del guardia: DNI, nombre completo
// y datos demográficos básicos. Si el input no parece un DNI escaneado, asumimos
// que el guardia tipeó solo el número y devolvemos {dni}.

export type ParsedDni = {
  dni: string;
  firstName?: string;
  lastName?: string;
  sex?: "M" | "F" | "X";
  birthDate?: string; // ISO yyyy-mm-dd
  raw: string;
  source: "scanner" | "manual";
};

const DDMMYYYY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function ddmmyyyyToIso(s: string): string | undefined {
  const m = s.match(DDMMYYYY_RE);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDniDigits(s: string): string {
  // Sacamos puntos, espacios y ceros a la izquierda
  return s.replace(/[^\d]/g, "").replace(/^0+/, "");
}

export function parseDni(input: string): ParsedDni | null {
  const raw = input.trim();
  if (!raw) return null;

  // Caso 1: input contiene `@` → es scan PDF417
  if (raw.includes("@")) {
    const parts = raw.split("@").map((p) => p.trim());
    // Detectamos formato nuevo (17 campos, primer campo es número de trámite)
    // o viejo (15 campos, primer campo es apellido).
    // Heurística: si el primer campo es solo dígitos, asumimos formato nuevo.
    const isNew = /^\d+$/.test(parts[0]);
    const offset = isNew ? 1 : 0;

    const lastName = parts[offset];
    const firstName = parts[offset + 1];
    const sexChar = (parts[offset + 2] || "").toUpperCase();
    const dniDigits = normalizeDniDigits(parts[offset + 3] || "");
    const birthRaw = parts[offset + 5] || "";

    if (!dniDigits) return null;

    return {
      dni: dniDigits,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      sex: sexChar === "M" || sexChar === "F" || sexChar === "X" ? (sexChar as "M" | "F" | "X") : undefined,
      birthDate: ddmmyyyyToIso(birthRaw),
      raw,
      source: "scanner",
    };
  }

  // Caso 2: input son solo dígitos (tipeo manual)
  const digits = normalizeDniDigits(raw);
  if (digits.length >= 7 && digits.length <= 9) {
    return { dni: digits, raw, source: "manual" };
  }

  return null;
}

// Formato display: 12.345.678
export function formatDni(dni: string): string {
  const digits = dni.replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
