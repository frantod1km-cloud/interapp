-- ============================================================================
-- 0021 — Listado maestro de unidades del barrio
-- ============================================================================
-- Antes "unit" era solo un text libre en cada residente (ej. "Lote 42",
-- "Depto 3B"). Sin listado, dos residentes podían tener "Lote 42" y "lote 42"
-- y no nos enterábamos. Y el guardia no podía decir formalmente "este
-- visitante va al Lote 42".
--
-- Ahora:
--   - units: lista maestra (id, label, kind, active)
--   - residents.unit_id: FK opcional (mantenemos unit text por legacy/display)
--   - access_events.destination_unit_id + destination_unit_label: a dónde
--     va cada visitante
-- ============================================================================

create table units (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  label           text not null,            -- "Lote 42", "Depto 3B", "Local 7"
  kind            text not null default 'lote'
                  check (kind in ('lote','casa','depto','local','oficina','otro')),
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, label)
);

create index on units (organization_id, active);
create index on units (organization_id, kind);

-- FK desde residents (opcional, set null si se borra la unidad)
alter table residents
  add column unit_id uuid references units(id) on delete set null;
create index on residents (unit_id);

-- FK desde access_events para "a qué unidad va este ingreso"
alter table access_events
  add column destination_unit_id uuid references units(id) on delete set null,
  add column destination_unit_label text;

-- RLS
alter table units enable row level security;

create policy "members see units"
on units for select
using (organization_id in (select current_user_org_ids()));

create policy "admins manage units"
on units for all
using (current_user_has_role(organization_id, 'org_admin'));
