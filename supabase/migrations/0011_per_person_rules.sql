-- ============================================================================
-- 0011 — Reglas de acceso per-persona + vínculo con quien autoriza
-- ============================================================================
--
-- Cambio de modelo: las reglas horarias (días + ventana) ya no son globales
-- por categoría, sino que se configuran sobre cada persona individual.
-- La empleada doméstica de Pedro tiene SUS horarios; la de Ana tiene OTROS.
-- Cada propietario/inquilino gestiona a sus empleados y proveedores con
-- sus propias reglas.
--
-- Para identificar quién autorizó a cada persona, sumamos
-- authorized_by_resident_id. Cuando es null, la persona fue cargada por la
-- administración (típicamente staff del barrio).
--
-- La tabla access_rules sigue existiendo pero queda implícitamente
-- restringida a kind='staff' (empleados del barrio): para ese tipo de persona
-- las reglas son globales porque trabajan para la organización, no para una
-- unidad. El admin las configura.
-- ============================================================================

alter table residents
  add column authorized_by_resident_id uuid references residents(id) on delete set null,
  add column weekday_mask int not null default 127 check (weekday_mask between 0 and 127),
  add column start_hour int not null default 0 check (start_hour between 0 and 23),
  add column end_hour int not null default 23 check (end_hour between 0 and 23),
  add column rule_enabled boolean not null default false;

create index on residents (authorized_by_resident_id);

-- RLS: el residente puede ver, crear, actualizar y borrar las personas que
-- él mismo autoriza (su empleada, su jardinero, etc.).
create policy "residents manage their authorized people"
on residents for all
to authenticated
using (
  authorized_by_resident_id in (
    select id from residents r2 where r2.user_id = auth.uid()
  )
)
with check (
  authorized_by_resident_id in (
    select id from residents r2 where r2.user_id = auth.uid()
  )
);
