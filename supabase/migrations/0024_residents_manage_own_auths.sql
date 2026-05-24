-- ============================================================================
-- 0024 — Residentes pueden modificar/borrar sus propias autorizaciones
-- ============================================================================
-- Antes solo el org_admin podía hacer UPDATE/DELETE sobre `authorizations`.
-- El residente que la había creado no podía revocarla ni borrar un link de
-- invitación que generó por error. Las server actions usan admin client para
-- saltearse la RLS, pero igual agregamos las policies por defensa en
-- profundidad — para que cualquier código futuro que use el cliente normal
-- pueda hacer lo correcto sin romperse.
-- ============================================================================

create policy "residents update own auths"
on authorizations for update
using (
  resident_id in (
    select id from residents
    where user_id = auth.uid()
      and organization_id = authorizations.organization_id
  )
)
with check (
  resident_id in (
    select id from residents
    where user_id = auth.uid()
      and organization_id = authorizations.organization_id
  )
);

create policy "residents delete own auths"
on authorizations for delete
using (
  resident_id in (
    select id from residents
    where user_id = auth.uid()
      and organization_id = authorizations.organization_id
  )
);
