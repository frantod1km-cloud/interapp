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
