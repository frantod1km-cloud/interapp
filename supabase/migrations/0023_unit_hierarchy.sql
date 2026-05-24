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
