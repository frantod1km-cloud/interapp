-- ============================================================================
-- 0017 — Acompañantes y notas en cada ingreso
-- ============================================================================
-- El guardia registra cuántas personas vienen ADEMÁS del titular y
-- opcionalmente una nota libre del ingreso (ej. "trae mudanza",
-- "viene en moto", "se queda 2 días").
--
-- companions: número de acompañantes (no incluye al titular). Default 0.
-- notes: texto libre opcional.
-- ============================================================================

alter table access_events
  add column companions int not null default 0 check (companions >= 0),
  add column notes text;
