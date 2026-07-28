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
  announcement_level    text default 'info' check (announcement_level in ('info','warning','danger')),
  signup_open           boolean not null default true,
  maintenance           boolean not null default false,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id) on delete set null
);

alter table platform_config enable row level security;
-- Sin policies: solo el service role (admin client del backend) puede leer/escribir.
-- Los usuarios normales no ven nada de esta tabla.

-- Seed la fila singleton
insert into platform_config (id) values ('singleton')
on conflict (id) do nothing;
