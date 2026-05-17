-- ============================================================================
-- 0003 — Soporte multi-garita
-- ============================================================================
-- Hasta ahora el sistema asumía una sola entrada/garita por barrio. Algunos
-- countries tienen 2-3 garitas. Cambio mínimo:
--
-- - Cada barrio puede definir N "gates" (etiquetas: "Principal", "Servicio")
-- - Cada access_event puede tener un gate_id opcional para distinguir desde
--   qué garita se registró
-- - El guardia "elige" su garita una vez en la tablet (se guarda en
--   localStorage del dispositivo) y todos sus registros llevan ese gate_id
--
-- No agregamos restricciones de rol — un guardia puede operar cualquier
-- garita. Si más adelante necesitamos limitar, agregamos una tabla
-- gate_assignments.
-- ============================================================================

create table gates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,                  -- "Principal", "Servicio"
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index on gates (organization_id, active);

alter table access_events
  add column gate_id uuid references gates(id) on delete set null,
  add column gate_label text;  -- nombre denormalizado para que el evento sobreviva si se borra el gate

-- RLS
alter table gates enable row level security;

create policy "members see gates"
on gates for select
using (organization_id in (select current_user_org_ids()));

create policy "admins manage gates"
on gates for all
using (current_user_has_role(organization_id, 'org_admin'));
