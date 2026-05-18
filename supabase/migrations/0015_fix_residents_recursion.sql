-- ============================================================================
-- 0015 — Fix recursión infinita en RLS de residents
-- ============================================================================
-- El bug: la policy "residents manage their authorized people" (creada en
-- 0011) hace un subquery `select id from residents where user_id = auth.uid()`
-- al evaluarse. Como ese subquery también pasa por RLS sobre residents, la
-- misma policy se vuelve a evaluar, generando recursión infinita.
--
-- Fix: extraer ese subquery a una función SECURITY DEFINER que bypassea RLS
-- (porque corre con privilegios del owner, no del usuario). Igual sigue
-- siendo seguro porque la función solo devuelve los residents del
-- auth.uid() actual.
-- ============================================================================

drop policy if exists "residents manage their authorized people" on residents;

create or replace function current_user_resident_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from residents where user_id = auth.uid();
$$;

create policy "residents manage their authorized people"
on residents for all
to authenticated
using (
  authorized_by_resident_id in (select current_user_resident_ids())
)
with check (
  authorized_by_resident_id in (select current_user_resident_ids())
);

-- Aprovechamos la función para evitar el mismo problema en otras policies
-- que consultan residents desde otras tablas. No es estrictamente necesario
-- porque la recursión solo ocurre cuando se consulta residents desde una
-- policy sobre residents — pero es buena práctica usar la helper.

drop policy if exists "residents manage own vehicles" on vehicles;
create policy "residents manage own vehicles"
on vehicles for all
to authenticated
using (resident_id in (select current_user_resident_ids()))
with check (resident_id in (select current_user_resident_ids()));

drop policy if exists "residents mark own packages delivered" on packages;
create policy "residents mark own packages delivered"
on packages for update
using (resident_id in (select current_user_resident_ids()));

drop policy if exists "residents create own auths" on authorizations;
create policy "residents create own auths"
on authorizations for insert
with check (
  organization_id in (select current_user_org_ids())
  and resident_id in (select current_user_resident_ids())
);

drop policy if exists "residents manage own templates" on visit_templates;
create policy "residents manage own templates"
on visit_templates for all
using (
  organization_id in (select current_user_org_ids())
  and resident_id in (select current_user_resident_ids())
);
