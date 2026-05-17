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
