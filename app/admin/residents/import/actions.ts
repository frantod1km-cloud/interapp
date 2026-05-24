"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { logAudit } from "@/lib/audit";
import { normalizeDni } from "@/lib/dni/parse";

// Parser CSV simple. No usa librería externa.
// Detecta separador (coma, ; o tab), maneja comillas dobles y filas vacías.
// No es bulletproof para todos los edge cases del estándar CSV, pero alcanza
// para la mayoría de exports de Excel/Google Sheets en español.

function detectDelimiter(line: string): string {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    const count = line.split(d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

type Row = { dni: string; first_name: string; last_name: string; unit: string | null; phone: string | null };

function looksLikeHeader(cells: string[]): boolean {
  const first = cells[0]?.toLowerCase() ?? "";
  return first === "dni" || first === "documento" || /[a-z]/i.test(first.replace(/\D/g, "") ? "" : first);
}

export async function importResidentsAction(formData: FormData) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Sin organización");
  const role = await getCurrentMemberRole(org.id);
  if (role !== "org_admin") throw new Error("Solo el admin del barrio puede hacer esto");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const csv = String(formData.get("csv") ?? "").trim();
  if (!csv) redirect("/admin/residents/import?error=" + encodeURIComponent("Pegá un CSV"));

  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) redirect("/admin/residents/import?error=" + encodeURIComponent("CSV vacío"));

  const delim = detectDelimiter(lines[0]);
  let startIdx = 0;

  // Saltar encabezado si la primera fila parece encabezado
  const firstCells = parseCsvLine(lines[0], delim);
  if (looksLikeHeader(firstCells) || !/^\d/.test(firstCells[0])) {
    startIdx = 1;
  }

  const rows: Row[] = [];
  const errors: string[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delim);
    if (cells.length < 3) {
      errors.push(`Fila ${i + 1}: faltan columnas (esperamos dni, nombre, apellido al menos)`);
      continue;
    }
    const dni = normalizeDni(cells[0]);
    const firstName = cells[1];
    const lastName = cells[2];
    const unit = cells[3]?.trim() || null;
    const phone = cells[4]?.trim() || null;

    // dni ya viene padeado a 8 dígitos. Aceptamos 8 dígitos (DNI estándar)
    // o más (extranjeros con ID largo).
    if (!dni || dni.length < 8 || dni.length > 10) {
      errors.push(`Fila ${i + 1}: DNI inválido ("${cells[0]}")`);
      continue;
    }
    if (!firstName || !lastName) {
      errors.push(`Fila ${i + 1}: faltan nombre o apellido`);
      continue;
    }
    rows.push({ dni, first_name: firstName, last_name: lastName, unit, phone });
  }

  if (rows.length === 0) {
    redirect(
      `/admin/residents/import?error=${encodeURIComponent("No se pudo parsear ninguna fila válida.\n" + errors.slice(0, 10).join("\n"))}`,
    );
  }

  // Insertamos con upsert para que un dni ya cargado no rompa el batch
  const payload = rows.map((r) => ({
    organization_id: org.id,
    dni: r.dni,
    first_name: r.first_name,
    last_name: r.last_name,
    unit: r.unit,
    phone: r.phone,
  }));

  const { data: inserted, error } = await supabase
    .from("residents")
    .upsert(payload, { onConflict: "organization_id,dni", ignoreDuplicates: true })
    .select("id");

  if (error) {
    redirect("/admin/residents/import?error=" + encodeURIComponent(error.message));
  }

  await logAudit({
    orgId: org.id,
    userId: user?.id ?? null,
    action: "resident.create",
    entityType: "resident_batch",
    metadata: { imported: inserted?.length ?? 0, attempted: rows.length, errors: errors.slice(0, 20) },
  });

  revalidatePath("/admin/residents");
  redirect(`/admin/residents/import?ok=${inserted?.length ?? 0}`);
}
