-- ============================================================================
-- interapp — Esquema completo (todas las migraciones unidas)
-- ============================================================================
-- Para una DB de Supabase nueva (producción o staging):
--   1. SQL Editor → New query
--   2. Pegar todo este archivo
--   3. Run
--
-- Si tu DB ya tiene tablas de versiones anteriores, no uses este archivo;
-- corré las migraciones individuales (0001…N) en orden.
-- ============================================================================


-- ============================================================================
-- 0001_init.sql
-- ============================================================================
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

-- ============================================================================
-- 0002_invitations.sql
-- ============================================================================
-- ============================================================================
-- 0002 — Invitaciones por link
-- ============================================================================
-- El residente puede generar una autorización "vacía" (sin DNI todavía) y
-- compartir un link tipo interapp.com/v/<token> al invitado. El invitado abre
-- el link, carga su DNI y nombre, y eso "claima" la autorización.
--
-- Una vez claimada, la autorización pasa a comportarse exactamente igual que
-- una creada a mano: aparece en el lookup del guardia.
-- ============================================================================

-- DNI puede ser null hasta que el invitado lo cargue
alter table authorizations alter column dni drop not null;

-- Token único para el link compartible
alter table authorizations add column invite_token text unique;

-- Cuándo se claimó (null = no claimada todavía)
alter table authorizations add column claimed_at timestamptz;

-- Índice para resolver tokens rápido
create index on authorizations (invite_token) where invite_token is not null;

-- Policy: cualquiera (incluso sin login) puede LEER una authorization por token,
-- pero solo si el token coincide y todavía no se claimó. Esto permite que el
-- invitado vea info del barrio en la página /v/[token].
create policy "anyone can read by invite token"
on authorizations for select
to anon
using (invite_token is not null and claimed_at is null);

-- Policy: cualquiera puede CLAIMAR (update) una authorization vía token.
-- El RLS sigue forzando que solo se permita si tiene el token correcto.
create policy "anyone can claim by invite token"
on authorizations for update
to anon
using (invite_token is not null and claimed_at is null)
with check (invite_token is not null);

-- ============================================================================
-- 0003_gates.sql
-- ============================================================================
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

-- ============================================================================
-- 0004_push_subscriptions.sql
-- ============================================================================
-- ============================================================================
-- 0004 — Suscripciones a web push
-- ============================================================================
-- Cada usuario puede tener N suscripciones push (una por dispositivo donde se
-- haya activado). Cuando entra una visita autorizada, mandamos notificación
-- al residente que la autorizó.
--
-- Endpoint es único por dispositivo → lo usamos como clave de upsert.
-- ============================================================================

create table push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz
);

create index on push_subscriptions (user_id);
create index on push_subscriptions (organization_id);

-- RLS: cada usuario solo ve/modifica sus propias suscripciones
alter table push_subscriptions enable row level security;

create policy "users manage their push subscriptions"
on push_subscriptions for all
using (user_id = auth.uid());

-- ============================================================================
-- 0005_visit_templates.sql
-- ============================================================================
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

-- ============================================================================
-- 0006_rate_limits.sql
-- ============================================================================
-- ============================================================================
-- 0006 — Rate limits
-- ============================================================================
-- Tabla simple para rate-limiting de endpoints públicos. Una row por
-- (identifier, action, window_start). Se "vence" sola: cualquier check fuera
-- de la ventana ignora rows viejas.
--
-- Función rate_limit_check(identifier, action, max_attempts, window_seconds)
-- hace todo atómicamente: limpia rows viejas, cuenta las del bucket actual,
-- inserta una nueva, devuelve si está permitido.
-- ============================================================================

create table rate_limits (
  id           bigserial primary key,
  identifier   text not null,        -- ej: "ip:1.2.3.4" o "user:uuid"
  action       text not null,        -- ej: "signup", "claim_invite"
  occurred_at  timestamptz not null default now()
);

create index on rate_limits (identifier, action, occurred_at);

-- Función atómica: registra el intento y devuelve cuántos intentos hubo
-- (incluido este) dentro de la ventana. El caller decide si bloquea.
create or replace function rate_limit_record(
  p_identifier text,
  p_action text,
  p_window_seconds int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  -- Borrar entradas viejas (mantenimiento perezoso)
  delete from rate_limits
  where action = p_action
    and occurred_at < now() - (p_window_seconds || ' seconds')::interval;

  -- Insertar este intento
  insert into rate_limits (identifier, action) values (p_identifier, p_action);

  -- Contar intentos en la ventana
  select count(*) into cnt
  from rate_limits
  where identifier = p_identifier
    and action = p_action
    and occurred_at >= now() - (p_window_seconds || ' seconds')::interval;

  return cnt;
end;
$$;

-- ============================================================================
-- 0007_roles_and_kinds.sql
-- ============================================================================
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

-- ============================================================================
-- 0008_access_rules.sql
-- ============================================================================
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

-- ============================================================================
-- 0009_packages.sql
-- ============================================================================
-- ============================================================================
-- 0009 — Módulo de paquetería
-- ============================================================================
-- Caso de uso: llega un Mercado Libre / OCA / delivery / regalo para un
-- residente que no está. El guardia lo recibe en la garita, le saca una foto
-- y lo asocia al residente. El residente se entera por push y cuando viene
-- a buscarlo el guardia lo marca como entregado.
--
-- Estados:
--   pending   → en la garita, esperando que lo retiren
--   delivered → entregado al residente o a quien él autorizó
--   returned  → devuelto al courier (caducó, residente lo rechazó, etc.)
-- ============================================================================

create table packages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  resident_id     uuid not null references residents(id) on delete cascade,

  -- Recepción
  received_by     uuid references auth.users(id) on delete set null,
  received_at     timestamptz not null default now(),
  description     text not null,
  courier         text,                 -- "Mercado Libre" / "OCA" / "Correo Arg." / "Delivery" / "Otro"
  photo_url       text,                 -- URL en Supabase Storage (bucket "packages")
  gate_id         uuid references gates(id) on delete set null,
  gate_label      text,

  -- Estado actual
  status          text not null default 'pending'
                  check (status in ('pending', 'delivered', 'returned')),

  -- Entrega
  delivered_at    timestamptz,
  delivered_by    uuid references auth.users(id) on delete set null,
  delivered_to    text,                 -- nombre de quien lo retiró (residente u otro)
  delivery_notes  text,

  created_at      timestamptz not null default now()
);

create index on packages (organization_id, status, received_at desc);
create index on packages (resident_id, status);

-- ============================================================================
-- RLS
-- ============================================================================
alter table packages enable row level security;

-- Lectura: cualquier miembro de la org puede ver paquetes
create policy "members see packages"
on packages for select
using (organization_id in (select current_user_org_ids()));

-- Guards, leads y admins pueden crear/actualizar/eliminar
create policy "guards manage packages"
on packages for all
using (
  organization_id in (select current_user_org_ids())
  and (
    current_user_has_role(organization_id, 'guard')
    or current_user_has_role(organization_id, 'guard_lead')
    or current_user_has_role(organization_id, 'org_admin')
  )
);

-- El residente puede marcar sus propios paquetes como entregados
-- (caso: "ya lo retiré, no es necesario que me sigan avisando")
create policy "residents mark own packages delivered"
on packages for update
using (
  resident_id in (
    select id from residents where user_id = auth.uid()
  )
);

-- ============================================================================
-- Storage bucket para fotos de paquetes
-- ============================================================================
-- Lo creamos público porque las URLs llevan UUIDs aleatorios y la foto en sí
-- no es información sensible (es para que el residente reconozca el paquete).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'packages',
  'packages',
  true,
  5 * 1024 * 1024,  -- 5MB máximo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ============================================================================
-- 0010_packages_pin_and_reminders.sql
-- ============================================================================
-- ============================================================================
-- 0010 — Paquetería: PIN para retiro por tercero + recordatorios automáticos
-- ============================================================================
-- Sumamos:
--
-- 1) pickup_pin (text): el residente genera un PIN de 6 dígitos y se lo manda
--    a quien va a retirar (ej: por WhatsApp). El guardia lo pide al entregar
--    si está seteado. Una vez entregado, el PIN se borra.
--
-- 2) pickup_pin_holder (text): nombre opcional de quién es la persona
--    autorizada (para dejar registro).
--
-- 3) last_reminder_at (timestamptz): última vez que mandamos push recordando
--    el paquete pendiente. El cron de recordatorios usa esto para no spamear.
-- ============================================================================

alter table packages
  add column pickup_pin text,
  add column pickup_pin_holder text,
  add column last_reminder_at timestamptz;

-- Para queries del cron: pendientes ordenados por antigüedad
create index on packages (organization_id, status, received_at)
  where status = 'pending';

-- ============================================================================
-- 0011_per_person_rules.sql
-- ============================================================================
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

-- ============================================================================
-- 0012_resident_access_expiry.sql
-- ============================================================================
-- ============================================================================
-- 0012 — Expiración automática del acceso de una persona
-- ============================================================================
-- El residente puede definir una fecha de finalización para cada empleado o
-- visita habitual (la empleada que viene hasta junio, el albañil hasta que
-- termine la obra, etc.). Después de esa fecha la persona queda
-- automáticamente sin acceso sin que el residente tenga que ir a borrarla.
--
-- null = sin expiración (acceso permanente, comportamiento por defecto).
-- ============================================================================

alter table residents
  add column access_expires_at timestamptz;

create index on residents (organization_id, access_expires_at)
  where access_expires_at is not null;

-- ============================================================================
-- 0013_marketplace.sql
-- ============================================================================
-- ============================================================================
-- 0013 — Marketplace de reservas (espacios, eventos, membresías)
-- ============================================================================
-- El administrador puede dar de alta:
--   - Espacios reservables por slot horario (SUM, pileta, cancha de tenis,
--     parrilla, etc.)
--   - Eventos con cupo (cena de fin de año, taller de cocina, evento puntual)
--   - Membresías recurrentes (gimnasio, clase de yoga semanal)
--
-- Los residentes los ven en /resident/marketplace, eligen y pagan vía
-- Mercado Pago — pero con la cuenta MP DEL BARRIO, no la nuestra. El dinero
-- va directo al barrio. Por eso cada org tiene su propia config de MP.
-- ============================================================================

-- Config de pagos por organización (separado del access_token nuestro para
-- las suscripciones de la plataforma). Cada barrio carga su propio token.
create table org_payment_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  mp_access_token text,        -- token del barrio para cobrar
  mp_public_key   text,
  currency_id     text not null default 'ARS',
  notify_emails   text,        -- email donde MP notifica al barrio (opcional)
  active          boolean not null default false,
  updated_at      timestamptz not null default now()
);

alter table org_payment_settings enable row level security;

create policy "admins manage payment settings"
on org_payment_settings for all
using (current_user_has_role(organization_id, 'org_admin'));

-- ---------------------------------------------------------------------------
-- LISTINGS (cosas reservables)
-- ---------------------------------------------------------------------------
create table listings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  kind            text not null check (kind in ('space', 'event', 'membership')),
  name            text not null,
  description     text,
  photo_url       text,
  price_ars       int not null check (price_ars >= 0),  -- en centavos o pesos; usamos pesos enteros
  active          boolean not null default true,

  -- Para 'space': duración estándar de un slot y cupo simultáneo
  slot_minutes        int default 60 check (slot_minutes is null or slot_minutes > 0),
  max_concurrent      int default 1 check (max_concurrent is null or max_concurrent > 0),
  advance_days        int default 30,   -- cuántos días para adelante se puede reservar
  open_hour           int default 8,
  close_hour          int default 22,

  -- Para 'event': fecha específica y cupo total
  event_starts_at     timestamptz,
  event_ends_at       timestamptz,
  event_capacity      int,

  -- Para 'membership': renovación mensual via MP Preapproval
  membership_months   int default 1,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on listings (organization_id, kind, active);

alter table listings enable row level security;

-- Lectura: cualquier miembro de la org puede ver listings activos
create policy "members see listings"
on listings for select
using (organization_id in (select current_user_org_ids()));

create policy "admins manage listings"
on listings for all
using (current_user_has_role(organization_id, 'org_admin'));

-- ---------------------------------------------------------------------------
-- RESERVATIONS
-- ---------------------------------------------------------------------------
create table reservations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  listing_id      uuid not null references listings(id) on delete cascade,
  resident_id     uuid not null references residents(id) on delete cascade,

  -- Ventana reservada (para spaces); para events copiamos del listing
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,

  -- Cantidad (1 para spaces; cantidad de tickets para events)
  quantity        int not null default 1 check (quantity > 0),

  -- Estado del ciclo de vida
  status          text not null default 'pending_payment'
                  check (status in ('pending_payment', 'confirmed', 'cancelled', 'completed')),

  -- Detalles de pago
  amount_ars      int not null,
  mp_preference_id text,
  mp_payment_id   text,
  paid_at         timestamptz,

  -- Cancelación
  cancelled_at    timestamptz,
  cancel_reason   text,

  created_at      timestamptz not null default now()
);

create index on reservations (organization_id, status, starts_at);
create index on reservations (listing_id, starts_at, ends_at);
create index on reservations (resident_id, status);
create unique index on reservations (mp_preference_id) where mp_preference_id is not null;

alter table reservations enable row level security;

-- Lectura: miembros de la org pueden ver reservas (admin todas, residente
-- las suyas)
create policy "members see reservations"
on reservations for select
using (organization_id in (select current_user_org_ids()));

-- Residentes pueden crear sus propias reservas
create policy "residents create own reservations"
on reservations for insert
with check (
  organization_id in (select current_user_org_ids())
  and resident_id in (
    select id from residents where user_id = auth.uid()
  )
);

-- Residentes pueden cancelar las suyas (status pending o confirmed)
create policy "residents update own reservations"
on reservations for update
using (
  resident_id in (select id from residents where user_id = auth.uid())
);

-- Admins manejan cualquier reserva de su org
create policy "admins manage reservations"
on reservations for all
using (current_user_has_role(organization_id, 'org_admin'));

-- ---------------------------------------------------------------------------
-- Storage bucket para fotos de listings
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listings',
  'listings',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ============================================================================
-- 0014_resident_self_manage.sql
-- ============================================================================
-- ============================================================================
-- 0014 — El residente puede gestionar sus propios vehículos
-- ============================================================================
-- Sumamos policy para que el residente cargue/edite/borre sus propias
-- patentes desde su perfil, sin depender del admin.
-- ============================================================================

create policy "residents manage own vehicles"
on vehicles for all
to authenticated
using (
  resident_id in (
    select id from residents where user_id = auth.uid()
  )
)
with check (
  resident_id in (
    select id from residents where user_id = auth.uid()
  )
);

-- ============================================================================
-- 0015_fix_residents_recursion.sql
-- ============================================================================
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

-- ============================================================================
-- 0016_resident_manages_people_vehicles.sql
-- ============================================================================
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

-- ============================================================================
-- 0017_access_events_companions_notes.sql
-- ============================================================================
-- ============================================================================
-- 0017 — Acompañantes y notas en cada ingreso
-- ============================================================================
-- El guardia registra cuántas personas vienen ADEMÁS del titular y
-- opcionalmente una nota libre del ingreso (ej. "trae mudanza",
-- "viene en moto", "se queda 2 días").
--
-- companions: número de acompañantes (no incluye al titular). Default 0.
-- notes: texto libre opcional.
-- ============================================================================

alter table access_events
  add column companions int not null default 0 check (companions >= 0),
  add column notes text;

-- ============================================================================
-- 0018_access_event_vehicle_details.sql
-- ============================================================================
-- ============================================================================
-- 0018 — Detalles del vehículo en cada ingreso
-- ============================================================================
-- Cuando el guardia carga una patente "Otra" (no asociada a ningún residente
-- en la base de vehículos), puede agregar también marca, modelo y color.
-- Estos quedan en el evento puntual; no se crea un vehicle row.
-- Si el residente quiere registrarlo como auto suyo, lo hace después desde
-- su perfil.
-- ============================================================================

alter table access_events
  add column vehicle_make text,
  add column vehicle_model text,
  add column vehicle_color text;

-- ============================================================================
-- 0019_companions_data.sql
-- ============================================================================
-- ============================================================================
-- 0019 — Datos de cada acompañante (no solo el conteo)
-- ============================================================================
-- Antes guardábamos solo `companions int` (cantidad). Ahora también guardamos
-- el detalle de cada acompañante (DNI, nombre) para tener trazabilidad real
-- de quién entró con quién.
--
-- companions_data jsonb es un array de objetos:
--   [{ "dni": "12345678", "full_name": "Pedro García", "resident_id": "uuid?", "authorization_id": "uuid?" }, ...]
--
-- El campo `companions` (int) se mantiene como cache del conteo para queries
-- rápidos. Se setea desde el cliente como length del array.
-- ============================================================================

alter table access_events
  add column companions_data jsonb not null default '[]'::jsonb;

-- Backfill: para eventos viejos que tenían solo companions=N, dejamos
-- companions_data como [] (no podemos saber quiénes eran).
-- Nada que actualizar — el default es []

-- ============================================================================
-- 0020_employees_and_other.sql
-- ============================================================================
-- ============================================================================
-- 0020 — Empleados del barrio: datos laborales + categoría "other"
-- ============================================================================
-- Sumamos campos para empleados de la administración del barrio:
--   - job_title  : cargo (ej. "Jardinero", "Mantenimiento", "Vigilancia diurna")
--   - employer   : empresa para la que trabaja (ej. "Cleaning SRL"), null si
--                  trabaja directamente para el barrio
--   - contract_type : 'permanent' | 'temporary'. Si es temporary, debe tener
--                     access_expires_at (ya existe desde 0012).
--
-- También sumamos la categoría "other" para casos que no encajan en las
-- 6 categorías predefinidas (owner/tenant/family/staff/domestic/contractor).
-- ============================================================================

-- Permitir kind='other'
alter table residents drop constraint if exists residents_kind_check;
alter table residents
  add constraint residents_kind_check
  check (kind in ('owner','tenant','family','staff','domestic','contractor','other'));

-- Datos laborales (relevantes para staff y opcionales para los demás)
alter table residents
  add column job_title text,
  add column employer text,
  add column contract_type text
    check (contract_type in ('permanent','temporary'));

-- ============================================================================
-- 0021_units.sql
-- ============================================================================
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

-- ============================================================================
-- 0022_normalize_dni.sql
-- ============================================================================
-- ============================================================================
-- 0022 — Normalizar DNI a 8 dígitos con cero a la izquierda
-- ============================================================================
-- Problema: el lector PDF417 del DNI argentino devuelve el número sin ceros
-- a la izquierda. Para gente mayor con DNI de 7 dígitos (ej. 3.332.301) el
-- scanner devuelve "3332301", pero el padrón suele estar cargado como
-- "03332301" (8 dígitos, formato canónico).
--
-- Resultado: el guardia escaneaba el DNI de una empleada doméstica y le decía
-- "DNI no registrado" aunque la persona estuviera cargada.
--
-- Solución: forma canónica = 8 dígitos con padding de ceros. Hacemos backfill
-- de todos los DNI almacenados para que coincidan con lo que el parser ahora
-- normaliza.
--
-- Reglas del backfill:
--   - <= 8 dígitos → lpad a 8 ("3332301" → "03332301")
--   - 9+ dígitos (extranjeros, IDs raros) → se deja como viene
--   - No tocamos access_events viejos (es historial; el dato como vino vale)
-- ============================================================================

-- Helper inline: solo padeamos si el DNI es numérico y <= 8 dígitos
-- (los regex_replace cubren el caso de DNI ya guardados con puntos/espacios).

update residents
set dni = lpad(regexp_replace(dni, '[^0-9]', '', 'g'), 8, '0')
where length(regexp_replace(dni, '[^0-9]', '', 'g')) between 1 and 8
  and dni is distinct from lpad(regexp_replace(dni, '[^0-9]', '', 'g'), 8, '0');

update authorizations
set dni = lpad(regexp_replace(dni, '[^0-9]', '', 'g'), 8, '0')
where length(regexp_replace(dni, '[^0-9]', '', 'g')) between 1 and 8
  and dni is distinct from lpad(regexp_replace(dni, '[^0-9]', '', 'g'), 8, '0');

-- visit_templates también guarda DNI del visitante recurrente
update visit_templates
set dni = lpad(regexp_replace(dni, '[^0-9]', '', 'g'), 8, '0')
where length(regexp_replace(dni, '[^0-9]', '', 'g')) between 1 and 8
  and dni is distinct from lpad(regexp_replace(dni, '[^0-9]', '', 'g'), 8, '0');

-- packages.recipient_dni si existe (no falla si la columna no existe)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'packages' and column_name = 'recipient_dni'
  ) then
    execute $sql$
      update packages
      set recipient_dni = lpad(regexp_replace(recipient_dni, '[^0-9]', '', 'g'), 8, '0')
      where recipient_dni is not null
        and length(regexp_replace(recipient_dni, '[^0-9]', '', 'g')) between 1 and 8
        and recipient_dni is distinct from lpad(regexp_replace(recipient_dni, '[^0-9]', '', 'g'), 8, '0')
    $sql$;
  end if;
end$$;

-- ============================================================================
-- 0023_unit_hierarchy.sql
-- ============================================================================
-- ============================================================================
-- 0023 — Jerarquía de unidades (árbol con niveles configurables por barrio)
-- ============================================================================
-- Antes cada unidad era un texto plano ("Lote 42") en una lista lineal. Eso
-- funcionaba para countries chicos, pero no para:
--   - Countries con sectores + etapas + lotes
--   - Edificios con torres + pisos + deptos
--   - Parques industriales con sectores + galpones
--
-- Solución: cada org define una vez sus "niveles" (ej. ["Sector","Etapa","Lote"])
-- y las unidades se cargan en árbol respetando esa jerarquía.
-- ============================================================================

-- 1. Estructura del árbol
alter table units
  add column parent_id uuid references units(id) on delete cascade,
  add column level int not null default 1,
  add column position int;  -- orden manual entre hermanos

create index on units (organization_id, parent_id);
create index on units (organization_id, level);

-- 2. Relajamos el check del `kind` viejo: ahora el "kind" es libre y matchea
-- el nombre del nivel configurado en la org (ej. "Sector", "Etapa", "Lote").
-- Esto evita que tengamos que enumerar todos los nombres posibles que
-- inventen los clientes.
alter table units drop constraint if exists units_kind_check;

-- 3. Cambiamos la unicidad: antes era (org, label) global. Ahora hermanos
-- del mismo padre no pueden tener el mismo label, pero distintos padres
-- pueden tener "Lote 1" cada uno.
alter table units drop constraint if exists units_organization_id_label_key;

-- Index único usando coalesce para tratar parent_id NULL como un grupo
-- (el de los nodos raíz). Postgres trata los NULL en unique normalmente
-- como distintos, así que necesitamos este truco.
create unique index units_unique_sibling_label
  on units (organization_id, coalesce(parent_id::text, '_root_'), label);

-- 4. Helper para devolver el breadcrumb completo de una unidad como texto.
-- Ej: "Lote 42 · Etapa 2 · Sector Norte"
create or replace function unit_breadcrumb(unit_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select id, parent_id, label, kind, level, 1 as depth
    from units where id = unit_id
    union all
    select u.id, u.parent_id, u.label, u.kind, u.level, c.depth + 1
    from units u
    join chain c on u.id = c.parent_id
  )
  select string_agg(coalesce(kind, '') || ' ' || label, ' · ' order by depth)
  from chain;
$$;

-- 5. Función para listar las unidades hoja (leaves) de una org con su
-- breadcrumb pre-calculado. La usamos para los pickers, para no pegarle
-- N queries al server.
create or replace function org_unit_leaves(org_id uuid)
returns table (
  id uuid,
  label text,
  kind text,
  level int,
  parent_id uuid,
  breadcrumb text,
  full_path text
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select
      u.id,
      u.label,
      u.kind,
      u.level,
      u.parent_id,
      u.active,
      u.organization_id,
      coalesce(u.kind, '') || ' ' || u.label as path_segment,
      coalesce(u.kind, '') || ' ' || u.label as full_path
    from units u
    where u.organization_id = org_id and u.parent_id is null
    union all
    select
      u.id,
      u.label,
      u.kind,
      u.level,
      u.parent_id,
      u.active,
      u.organization_id,
      coalesce(u.kind, '') || ' ' || u.label,
      t.full_path || ' · ' || coalesce(u.kind, '') || ' ' || u.label
    from units u
    join tree t on u.parent_id = t.id
    where u.organization_id = org_id
  )
  -- Solo hojas activas (que no tienen hijos)
  select
    t.id,
    t.label,
    t.kind,
    t.level,
    t.parent_id,
    -- breadcrumb es el full_path sin la hoja misma (para mostrar "Etapa 2 · Sector Norte")
    case
      when t.full_path like '% · %'
        then regexp_replace(t.full_path, ' · [^·]+$', '')
      else ''
    end as breadcrumb,
    t.full_path
  from tree t
  where t.active
    and not exists (
      select 1 from units c
      where c.parent_id = t.id and c.active
    )
  order by t.full_path;
$$;

-- 6. Las settings del org guardan los niveles. Asumimos que organizations.settings
-- ya es jsonb (lo es desde 0001). Si una org no tiene unit_levels configurados,
-- el frontend la manda al wizard.
--
-- Ejemplo: organizations.settings = {"unit_levels": ["Sector","Etapa","Lote"]}
--
-- No hay schema validation en la DB para que sea flexible. El admin actualiza
-- via /api/admin/org-settings.

-- ============================================================================
-- 0024_residents_manage_own_auths.sql
-- ============================================================================
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

-- ============================================================================
-- 0025_platform_config.sql
-- ============================================================================
-- ============================================================================
-- 0025 — Config global de la plataforma (usada por el super admin)
-- ============================================================================
-- Una sola fila (id="singleton") que guarda toggles/anuncios que aplican a
-- todos los barrios. Ej:
--   - announcement: banner que se muestra en todos los admin panels
--   - signup_open: si se puede crear barrios nuevos desde el signup público
--   - maintenance: modo mantenimiento (bloquea escrituras)
--
-- Todo super_admin puede leer/escribir. Nadie más puede leer.
-- (Las policies del super_admin usan admin client, no RLS — pero mantenemos
-- RLS habilitado con policy vacía para bloquear a otros.)
-- ============================================================================

create table platform_config (
  id                    text primary key,
  announcement          text,
  announcement_level    text not null default 'info',
  signup_open           boolean not null default true,
  maintenance           boolean not null default false,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id) on delete set null,
  constraint platform_config_announcement_level_valid
    check (announcement_level in ('info','warning','danger'))
);

alter table platform_config enable row level security;
-- Sin policies: solo el service role (admin client del backend) puede leer/escribir.
-- Los usuarios normales no ven nada de esta tabla.

-- Seed la fila singleton
insert into platform_config (id) values ('singleton')
on conflict (id) do nothing;
