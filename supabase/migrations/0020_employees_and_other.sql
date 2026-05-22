-- ============================================================================
-- 0020 — Empleados del barrio: datos laborales + categoría "other"
-- ============================================================================
-- Sumamos campos para empleados de la administración del barrio:
--   - job_title  : cargo (ej. "Jardinero", "Mantenimiento", "Vigilancia diurna")
--   - employer   : empresa para la que trabaja (ej. "Cleaning SRL"), null si
--                  trabaja directamente para el barrio
--   - contract_type : 'permanent' | 'temporary'. Si es temporary, debe tener
--                     access_expires_at (ya existe desde 0012).
--
-- También sumamos la categoría "other" para casos que no encajan en las
-- 6 categorías predefinidas (owner/tenant/family/staff/domestic/contractor).
-- ============================================================================

-- Permitir kind='other'
alter table residents drop constraint if exists residents_kind_check;
alter table residents
  add constraint residents_kind_check
  check (kind in ('owner','tenant','family','staff','domestic','contractor','other'));

-- Datos laborales (relevantes para staff y opcionales para los demás)
alter table residents
  add column job_title text,
  add column employer text,
  add column contract_type text
    check (contract_type in ('permanent','temporary'));
