-- ============================================================================
-- 0019 — Datos de cada acompañante (no solo el conteo)
-- ============================================================================
-- Antes guardábamos solo `companions int` (cantidad). Ahora también guardamos
-- el detalle de cada acompañante (DNI, nombre) para tener trazabilidad real
-- de quién entró con quién.
--
-- companions_data jsonb es un array de objetos:
--   [{ "dni": "12345678", "full_name": "Pedro García", "resident_id": "uuid?", "authorization_id": "uuid?" }, ...]
--
-- El campo `companions` (int) se mantiene como cache del conteo para queries
-- rápidos. Se setea desde el cliente como length del array.
-- ============================================================================

alter table access_events
  add column companions_data jsonb not null default '[]'::jsonb;

-- Backfill: para eventos viejos que tenían solo companions=N, dejamos
-- companions_data como [] (no podemos saber quiénes eran).
-- Nada que actualizar — el default es []
