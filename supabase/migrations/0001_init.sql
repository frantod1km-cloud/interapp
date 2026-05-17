-- ============================================================================
-- INTERAPP — Esquema inicial multi-tenant con Row Level Security
-- ============================================================================
-- Filosofía: una sola base, datos aislados por organization_id, RLS aplicado
-- desde el día uno. Ningún query del frontend puede ver datos de otra org.
-- ============================================================================

-- Extensiones
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. ORGANIZATIONS (cada barrio / country / edificio)
-- ---------------------------------------------------------------------------
create table organizations (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,           -- subdominio: "losalamos"
  name            text not null,
  logo_url        text,
  plan            text not null default 'trial',  -- trial | basic | pro | enterprise
  status          text not null default 'active', -- active | past_due | suspended | archived
  settings        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index on organizations (slug);

-- ---------------------------------------------------------------------------
-- 2. ORG MEMBERS (usuarios ↔ organizaciones + rol)
-- ---------------------------------------------------------------------------
-- Roles: super_admin | org_admin | guard | resident | viewer
create table org_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('org_admin','guard','resident','viewer')),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index on org_members (user_id);
create index on org_members (organization_id);

-- ---------------------------------------------------------------------------
-- 3. RESIDENTS (personas que viven en el barrio)
-- ---------------------------------------------------------------------------
create table residents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null, -- si tiene cuenta
  dni             text not null,
  first_name      text not null,
  last_name       text not null,
  unit            text,             -- lote / depto / casa
  phone           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, dni)
);

create index on residents (organization_id, active);
create index on residents (organization_id, dni);

-- ---------------------------------------------------------------------------
-- 4. VEHICLES (autos asociados a residentes)
-- ---------------------------------------------------------------------------
create table vehicles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  resident_id     uuid not null references residents(id) on delete cascade,
  plate           text not null,
  make            text,
  model           text,
  color           text,
  created_at      timestamptz not null default now(),
  unique (organization_id, plate)
);

-- ---------------------------------------------------------------------------
-- 5. AUTHORIZATIONS (visitas autorizadas por residentes)
-- ---------------------------------------------------------------------------
create table authorizations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  resident_id     uuid not null references residents(id) on delete cascade,
  dni             text not null,                  -- DNI del invitado
  visitor_name    text,
  valid_from      timestamptz not null default now(),
  valid_until     timestamptz not null,           -- vencimiento explícito
  notes           text,
  revoked         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index on authorizations (organization_id, dni, valid_until);
create index on authorizations (resident_id);

-- ---------------------------------------------------------------------------
-- 6. ACCESS EVENTS (cada ingreso/egreso registrado)
-- ---------------------------------------------------------------------------
create table access_events (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  guard_id            uuid references auth.users(id) on delete set null,
  authorization_id    uuid references authorizations(id) on delete set null,
  resident_id         uuid references residents(id) on delete set null,
  dni                 text not null,
  full_name           text,
  direction           text not null check (direction in ('in','out')),
  result              text not null check (result in ('authorized','denied','forced','manual')),
  reason              text,                       -- si fue forzado o denegado
  photo_url           text,
  vehicle_plate       text,
  occurred_at         timestamptz not null default now(),
  synced_at           timestamptz,                -- si vino de cola offline
  created_at          timestamptz not null default now()
);

create index on access_events (organization_id, occurred_at desc);
create index on access_events (organization_id, dni);

-- ---------------------------------------------------------------------------
-- 7. SUBSCRIPTIONS (estado de pago por organización)
-- ---------------------------------------------------------------------------
create table subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations(id) on delete cascade unique,
  plan                    text not null,
  status                  text not null,            -- active | past_due | suspended | cancelled
  mp_preapproval_id       text,                     -- ID de Mercado Pago
  current_period_end      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. AUDIT LOG (quién hizo qué)
-- ---------------------------------------------------------------------------
create table audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  action          text not null,
  entity_type     text,
  entity_id       uuid,
  metadata        jsonb,
  occurred_at     timestamptz not null default now()
);

create index on audit_log (organization_id, occurred_at desc);

-- ============================================================================
-- HELPER FUNCTIONS para RLS
-- ============================================================================

-- Devuelve las organizaciones a las que pertenece el usuario actual
create or replace function current_user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from org_members where user_id = auth.uid();
$$;

-- Devuelve true si el usuario tiene un rol específico en una organización
create or replace function current_user_has_role(org_id uuid, required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where user_id = auth.uid()
      and organization_id = org_id
      and role = required_role
  );
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table organizations    enable row level security;
alter table org_members      enable row level security;
alter table residents        enable row level security;
alter table vehicles         enable row level security;
alter table authorizations   enable row level security;
alter table access_events    enable row level security;
alter table subscriptions    enable row level security;
alter table audit_log        enable row level security;

-- ORGANIZATIONS: ver solo las orgs donde sos miembro
create policy "members see their orgs"
on organizations for select
using (id in (select current_user_org_ids()));

create policy "admins update their org"
on organizations for update
using (current_user_has_role(id, 'org_admin'));

-- ORG_MEMBERS: ver los miembros de las orgs donde sos miembro
create policy "see members of own orgs"
on org_members for select
using (organization_id in (select current_user_org_ids()));

create policy "admins manage members"
on org_members for all
using (current_user_has_role(organization_id, 'org_admin'));

-- RESIDENTS: cualquier miembro de la org puede leer; solo admin puede modificar
create policy "members see residents"
on residents for select
using (organization_id in (select current_user_org_ids()));

create policy "admins manage residents"
on residents for all
using (current_user_has_role(organization_id, 'org_admin'));

-- VEHICLES
create policy "members see vehicles"
on vehicles for select
using (organization_id in (select current_user_org_ids()));

create policy "admins manage vehicles"
on vehicles for all
using (current_user_has_role(organization_id, 'org_admin'));

-- AUTHORIZATIONS: residentes ven las suyas, guardias ven todas de la org, admin todo
create policy "members see authorizations"
on authorizations for select
using (organization_id in (select current_user_org_ids()));

create policy "residents create own auths"
on authorizations for insert
with check (
  organization_id in (select current_user_org_ids())
  and resident_id in (
    select id from residents
    where user_id = auth.uid() and organization_id = authorizations.organization_id
  )
);

create policy "admins manage authorizations"
on authorizations for all
using (current_user_has_role(organization_id, 'org_admin'));

-- ACCESS_EVENTS: lectura para miembros; insert para guardias y admins
create policy "members see access events"
on access_events for select
using (organization_id in (select current_user_org_ids()));

create policy "guards insert access events"
on access_events for insert
with check (
  organization_id in (select current_user_org_ids())
  and (
    current_user_has_role(organization_id, 'guard')
    or current_user_has_role(organization_id, 'org_admin')
  )
);

-- SUBSCRIPTIONS: solo admins de la org
create policy "admins see subscription"
on subscriptions for select
using (current_user_has_role(organization_id, 'org_admin'));

-- AUDIT_LOG: solo admins
create policy "admins see audit log"
on audit_log for select
using (current_user_has_role(organization_id, 'org_admin'));
