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
