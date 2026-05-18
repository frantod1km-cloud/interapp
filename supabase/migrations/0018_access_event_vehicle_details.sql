-- ============================================================================
-- 0018 — Detalles del vehículo en cada ingreso
-- ============================================================================
-- Cuando el guardia carga una patente "Otra" (no asociada a ningún residente
-- en la base de vehículos), puede agregar también marca, modelo y color.
-- Estos quedan en el evento puntual; no se crea un vehicle row.
-- Si el residente quiere registrarlo como auto suyo, lo hace después desde
-- su perfil.
-- ============================================================================

alter table access_events
  add column vehicle_make text,
  add column vehicle_model text,
  add column vehicle_color text;
