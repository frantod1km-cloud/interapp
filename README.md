# interapp

SaaS multi-tenant de control de accesos para barrios privados, countries, edificios, clubes y parques industriales.

**Filosofía:** una sola pregunta — "¿esta persona puede entrar?" — respondida en menos de 2 segundos. Todo lo demás es accesorio.

## Stack

- **Next.js 16** (App Router, RSC, Server Actions, Turbopack)
- **Supabase** (Postgres + Auth + RLS) para multi-tenancy real
- **Tailwind v4** para UI
- **TypeScript** estricto
- **Mercado Pago** (suscripciones) — fase 2

## Arquitectura

```
.
├── app/
│   ├── page.tsx              landing / redirección por subdominio
│   ├── login/                login con email + password
│   ├── guard/                pantalla única del guardia (verde/rojo/amarillo)
│   └── admin/                panel admin del barrio
│       ├── residents/        alta + listado de residentes
│       └── events/           ingresos del día
├── lib/
│   ├── supabase/             clients (browser, server, service-role)
│   ├── dni/                  parser del PDF417 del DNI argentino
│   ├── access/lookup.ts      resolver DNI → autorizado/vencido/desconocido
│   └── org.ts                resolver org actual por subdominio
├── proxy.ts                  resuelve subdominio → org + refresca sesión
└── supabase/migrations/      esquema SQL + Row Level Security policies
```

Cada barrio = una organización en la base. Subdominios `losalamos.interapp.com` resuelven a la org. RLS de Postgres garantiza aislamiento de datos a nivel de base.

## Setup local

1. **Crear proyecto Supabase** en https://app.supabase.com.
2. **Correr la migración:** SQL Editor → pegar `supabase/migrations/0001_init.sql` → ejecutar.
3. **Configurar variables de entorno:**
   ```bash
   cp .env.local.example .env.local
   # editar .env.local con los valores reales del proyecto Supabase
   ```
4. **Levantar dev server:**
   ```bash
   npm run dev
   ```

### Probar subdominios en desarrollo

En localhost, `subdominio.localhost:3000` resuelve al slug `subdominio`. Ejemplo:

```
http://test.localhost:3000/guard
```

No requiere editar `/etc/hosts` — los navegadores modernos resuelven `*.localhost` automáticamente.

### Crear la primera organización + admin (manual, hasta que esté el onboarding)

Desde el SQL Editor de Supabase:

```sql
-- 1. Crear usuario admin desde Auth → Users en el dashboard
-- 2. Crear organización
insert into organizations (slug, name) values ('test', 'Barrio Test') returning id;

-- 3. Hacer al usuario admin de la org (reemplazar UUIDs)
insert into org_members (organization_id, user_id, role)
values ('<org-uuid>', '<user-uuid>', 'org_admin');
```

Después: visitar `http://test.localhost:3000`, login, ir a `/admin/residents` para cargar el padrón.

## Flujo del guardia

1. Pantalla con un input invisible que siempre tiene focus.
2. El guardia escanea el DNI con cualquier lector PDF417 USB (actúa como teclado HID).
3. Al detectar Enter, el sistema parsea el contenido, busca en el padrón y responde:
   - **VERDE** — autorizado (residente o invitado vigente) → un click "Registrar ingreso".
   - **AMARILLO** — autorización vencida o DNI desconocido → forzar o rechazar.
   - **ROJO** — error técnico.
4. Auto-vuelve al estado idle en 1.5 segundos para el próximo scan.

Funciona también tipeando los 7-8 dígitos del DNI a mano + Enter.

## Roadmap

- [x] **Fase 1 — MVP del guardia** (este commit)
- [ ] Fase 2 — Onboarding self-service + Mercado Pago suscripciones
- [ ] Fase 3 — App PWA del residente para autorizar visitas
- [ ] Fase 4 — Offline-first con Service Worker + IndexedDB
- [ ] Fase 5 — Vehículos, reportes, multi-acceso, API pública

## Scripts

```bash
npm run dev     # dev server con Turbopack
npm run build   # build de producción
npm run start   # correr el build
npm run lint    # eslint
```
