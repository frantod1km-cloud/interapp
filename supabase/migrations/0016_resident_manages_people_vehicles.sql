-- ============================================================================
-- 0016 — El residente también puede cargar vehículos de su gente
-- ============================================================================
-- La empleada o el plomero de un residente pueden venir en auto. El residente
-- debe poder cargar la patente sin pedirle al admin del barrio.
--
-- La policy 0014 solo permitía manejar los vehículos del propio residente
-- (resident_id = mi id). Ahora también incluye los de las personas que él
-- autoriza (authorized_by_resident_id = mi id).
-- ============================================================================

-- Nueva helper: ids de residents que el usuario actual "gestiona" (él mismo
-- + todos los que él autoriza). SECURITY DEFINER para evitar recursión RLS.
create or replace function current_user_managed_resident_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id from residents where user_id = auth.uid())
  select id from me
  union
  select id from residents where authorized_by_resident_id in (select id from me);
$$;

-- Reemplazar la policy 0014 por una que use la nueva helper
drop policy if exists "residents manage own vehicles" on vehicles;
create policy "residents manage own and authorized vehicles"
on vehicles for all
to authenticated
using (resident_id in (select current_user_managed_resident_ids()))
with check (resident_id in (select current_user_managed_resident_ids()));
