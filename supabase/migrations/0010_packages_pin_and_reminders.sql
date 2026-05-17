-- ============================================================================
-- 0010 — Paquetería: PIN para retiro por tercero + recordatorios automáticos
-- ============================================================================
-- Sumamos:
--
-- 1) pickup_pin (text): el residente genera un PIN de 6 dígitos y se lo manda
--    a quien va a retirar (ej: por WhatsApp). El guardia lo pide al entregar
--    si está seteado. Una vez entregado, el PIN se borra.
--
-- 2) pickup_pin_holder (text): nombre opcional de quién es la persona
--    autorizada (para dejar registro).
--
-- 3) last_reminder_at (timestamptz): última vez que mandamos push recordando
--    el paquete pendiente. El cron de recordatorios usa esto para no spamear.
-- ============================================================================

alter table packages
  add column pickup_pin text,
  add column pickup_pin_holder text,
  add column last_reminder_at timestamptz;

-- Para queries del cron: pendientes ordenados por antigüedad
create index on packages (organization_id, status, received_at)
  where status = 'pending';
