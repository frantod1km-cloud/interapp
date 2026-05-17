-- ============================================================================
-- 0007 — Rol guard_lead (jefe de guardia) + categorías de residentes
-- ============================================================================
--
-- A) Nuevo rol "guard_lead":
--    - Mismo acceso operativo que un guard (pantalla de control).
--    - Suma acceso a /guard/supervision para ver qué hacen sus guardias.
--    - Puede dar de alta/baja OTROS guardias (no otros leads).
--    - NO ve residentes, vehículos, ni billing.
--
-- B) Categorías de residentes (columna kind):
--    - Solo informativo para el guardia, no cambia permisos.
--    - El admin filtra por categoría en el listado.
-- ============================================================================

-- A) Extender el check constraint del rol
alter table org_members drop constraint if exists org_members_role_check;
alter table org_members
  add constraint org_members_role_check
  check (role in ('org_admin', 'guard_lead', 'guard', 'resident', 'viewer'));

-- B) Categorías para residentes
alter table residents
  add column kind text not null default 'owner'
  check (kind in ('owner', 'tenant', 'family', 'staff', 'domestic', 'contractor'));

create index on residents (organization_id, kind);

-- Política RLS: guard_lead puede manejar la membership de otros guardias
-- de su misma org, pero solo para role='guard' (no puede crear más leads
-- ni tocar admins).
create policy "guard_leads manage guards"
on org_members for all
using (
  current_user_has_role(organization_id, 'guard_lead')
  and role = 'guard'
)
with check (
  current_user_has_role(organization_id, 'guard_lead')
  and role = 'guard'
);
