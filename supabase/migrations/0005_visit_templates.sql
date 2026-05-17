-- ============================================================================
-- 0005 — Plantillas de visitas recurrentes
-- ============================================================================
-- Para visitas habituales (empleada doméstica, jardinero, profe particular).
-- El residente crea la plantilla una vez con DNI + nombre + horario, y luego
-- la aplica con un click para generar la autorización del día.
--
-- Por simplicidad NO automatizamos el alta diaria. Si el usuario quiere algo
-- recurrente automático, se hace en una fase futura con cron + reglas.
-- ============================================================================

create table visit_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  resident_id     uuid not null references residents(id) on delete cascade,
  label           text not null,                  -- "Empleada", "Jardinero", "Profe Inglés"
  dni             text not null,
  visitor_name    text not null,
  default_until_hour int not null default 18,     -- 0..23, hora local del fin del día por defecto
  notes           text,
  created_at      timestamptz not null default now()
);

create index on visit_templates (resident_id);

alter table visit_templates enable row level security;

create policy "members see templates"
on visit_templates for select
using (organization_id in (select current_user_org_ids()));

create policy "residents manage own templates"
on visit_templates for all
using (
  organization_id in (select current_user_org_ids())
  and resident_id in (
    select id from residents
    where user_id = auth.uid() and organization_id = visit_templates.organization_id
  )
);
