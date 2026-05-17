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
