-- ============================================================================
-- 0012 — Expiración automática del acceso de una persona
-- ============================================================================
-- El residente puede definir una fecha de finalización para cada empleado o
-- visita habitual (la empleada que viene hasta junio, el albañil hasta que
-- termine la obra, etc.). Después de esa fecha la persona queda
-- automáticamente sin acceso sin que el residente tenga que ir a borrarla.
--
-- null = sin expiración (acceso permanente, comportamiento por defecto).
-- ============================================================================

alter table residents
  add column access_expires_at timestamptz;

create index on residents (organization_id, access_expires_at)
  where access_expires_at is not null;
