-- ============================================================================
-- 0014 — El residente puede gestionar sus propios vehículos
-- ============================================================================
-- Sumamos policy para que el residente cargue/edite/borre sus propias
-- patentes desde su perfil, sin depender del admin.
-- ============================================================================

create policy "residents manage own vehicles"
on vehicles for all
to authenticated
using (
  resident_id in (
    select id from residents where user_id = auth.uid()
  )
)
with check (
  resident_id in (
    select id from residents where user_id = auth.uid()
  )
);
