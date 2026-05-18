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
