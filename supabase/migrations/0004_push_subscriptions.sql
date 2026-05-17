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
