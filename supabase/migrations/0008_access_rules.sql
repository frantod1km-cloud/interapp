-- ============================================================================
-- 0008 — Reglas de acceso por categoría
-- ============================================================================
--
-- Cada barrio puede definir reglas horarias para cada categoría de residente.
-- Si no hay regla, no hay restricción (compat hacia atrás: nada cambia).
--
-- Cuando un guardia escanea el DNI de alguien con regla activa:
--   - Si está dentro de la ventana → VERDE como siempre.
--   - Si está fuera de la ventana → AMARILLO con mensaje "Fuera de horario
--     habitual". El guardia decide: forzar o rechazar.
--
-- Modelo:
--   - weekday_mask: bitmask de días permitidos (bit 0 = domingo, bit 1 = lunes...).
--     Default 127 (0b1111111) = todos los días.
--   - start_hour / end_hour: ventana horaria (0-23). Inclusive ambos.
--     Si start == end → todo el día. Si start > end → cruza medianoche.
--   - enabled: si false, la regla se ignora (útil para tener configurada
--     una regla "lista" pero pausada).
--
-- Una sola regla por (org, kind) — unique constraint.
-- ============================================================================

create table access_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind            text not null check (kind in ('owner', 'tenant', 'family', 'staff', 'domestic', 'contractor')),
  weekday_mask    int not null default 127 check (weekday_mask between 0 and 127),
  start_hour      int not null default 0 check (start_hour between 0 and 23),
  end_hour        int not null default 23 check (end_hour between 0 and 23),
  enabled         boolean not null default true,
  updated_at      timestamptz not null default now(),
  unique (organization_id, kind)
);

create index on access_rules (organization_id);

-- RLS: lectura para cualquier miembro, escritura solo para admin
alter table access_rules enable row level security;

create policy "members see access rules"
on access_rules for select
using (organization_id in (select current_user_org_ids()));

create policy "admins manage access rules"
on access_rules for all
using (current_user_has_role(organization_id, 'org_admin'));
