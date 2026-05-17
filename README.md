# interapp

SaaS multi-tenant de control de accesos para barrios privados, countries, edificios, clubes y parques industriales.

**Filosofía:** una sola pregunta — "¿esta persona puede entrar?" — respondida en menos de 2 segundos. Todo lo demás es accesorio.

## Estado actual

| Fase | Estado | Qué incluye |
|---|---|---|
| 1 — MVP guardia | ✅ | Pantalla de control con scan PDF417, RLS multi-tenant, panel admin mínimo |
| 2 — Self-service + pagos | ✅ | Signup público, planes, Mercado Pago Preapproval, panel super admin |
| 3 — Residentes | ✅ | Panel del residente, autorizar visitas, links compartibles |
| 4 — Offline + PWA | ✅ | Service Worker, padrón en IndexedDB, cola de eventos offline |
| 5+ — Profundidad | 🟡 | Vehículos, OCR de patentes, reportes, multi-acceso, API pública |

## Stack

- **Next.js 16** (App Router, RSC, Server Actions, Turbopack)
- **Supabase** (Postgres + Auth + RLS)
- **Tailwind v4**
- **TypeScript** estricto
- **Mercado Pago** Preapproval API (suscripciones)
- **PWA** con Service Worker + IndexedDB

## Estructura

```
.
├── app/
│   ├── page.tsx                landing (con o sin subdominio)
│   ├── login/
│   ├── signup/                 elección de plan + crear barrio
│   ├── guard/                  pantalla del guardia (PWA offline-first)
│   ├── admin/                  panel del barrio (dashboard, residentes, eventos, billing)
│   ├── resident/               panel del residente (autorizar, links, historial)
│   ├── super/                  panel super admin (ver orgs, métricas)
│   ├── v/[token]/              página pública del invitado para claimar link
│   └── api/
│       ├── guard/
│       │   ├── snapshot/       padrón completo para cachear offline
│       │   ├── lookup/         lookup de DNI server-side
│       │   └── events/         flush de cola offline
│       └── mercadopago/
│           └── webhook/        callback de Mercado Pago
├── lib/
│   ├── supabase/               clients (browser, server, service-role)
│   ├── dni/parse.ts            parser PDF417 del DNI argentino
│   ├── access/lookup.ts        lógica autorizado / vencido / desconocido (server)
│   ├── offline/                snapshot + cola en IndexedDB + lookup client-side
│   ├── plans.ts                catálogo de planes y precios
│   ├── mp.ts                   wrapper Mercado Pago Preapproval API
│   └── org.ts                  resolver de organización actual por subdominio
├── components/
│   └── SubscriptionBanner.tsx  banner de cuenta vencida / suspendida
├── proxy.ts                    resuelve subdominio → org + refresca sesión
├── public/
│   ├── manifest.webmanifest    PWA install
│   └── sw.js                   service worker
└── supabase/migrations/
    ├── 0001_init.sql           esquema base + RLS policies
    └── 0002_invitations.sql    links compartibles
```

## Setup local

1. **Crear proyecto Supabase** en https://app.supabase.com.
2. **Correr migraciones** en orden, pegando cada una en el SQL Editor:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_invitations.sql`
3. **Configurar variables de entorno:**
   ```bash
   cp .env.local.example .env.local
   # editar con valores reales de Supabase y, opcional, Mercado Pago
   ```
4. **Levantar dev server:**
   ```bash
   npm run dev
   ```

### Probar subdominios en desarrollo

`*.localhost:3000` resuelve al slug automáticamente, sin tocar `/etc/hosts`:

```
http://test.localhost:3000/guard
```

### Crear la primera organización + admin

Opciones:

- **Self-service (recomendado):** visitar `http://localhost:3000/signup`, elegir plan trial (gratis), crear barrio. Te redirige al subdominio nuevo.
- **Manual (para seed inicial):** desde el SQL Editor:
  ```sql
  -- 1. Crear usuario admin desde Auth → Users en el dashboard de Supabase
  -- 2. Crear organización
  insert into organizations (slug, name) values ('test', 'Barrio Test') returning id;

  -- 3. Hacer al usuario admin (reemplazar UUIDs)
  insert into org_members (organization_id, user_id, role)
  values ('<org-uuid>', '<user-uuid>', 'org_admin');
  ```

### Habilitar el panel super admin (nosotros)

Desde el dashboard de Supabase, editar el usuario que va a ser super admin y agregar al `raw_user_meta_data`:

```json
{ "is_super": true }
```

Después: `http://localhost:3000/super`.

## Flujos clave

### Guardia (más crítico)

1. Abre `subdominio.interapp.com/guard` en una tablet en la garita.
2. Input invisible con focus permanente — cualquier lector PDF417 USB (HID) funciona out of the box.
3. Al detectar Enter, parsea, hace lookup y muestra:
   - **VERDE** — autorizado (residente o invitado vigente) → 1 click registrar.
   - **AMARILLO** — vencido o desconocido → forzar / rechazar.
   - **ROJO** — error de sistema.
4. Auto-vuelve a idle en 1.5s.

**Offline:** la primera vez que abre con internet, descarga el padrón a IndexedDB. Después puede operar sin red:
- Lookup va contra el snapshot local.
- Eventos confirmados quedan encolados; se suben cuando vuelve la conexión.
- Header muestra "SIN CONEXIÓN" + cantidad en cola.

### Residente

1. Login con email/password.
2. `/resident` muestra autorizaciones vigentes.
3. **"Autorizar visita"** → form rápido con DNI + nombre + hasta cuándo.
4. **"Generar link"** → crea autorización sin DNI, devuelve link tipo `interapp.com/v/abc123` para mandar por WhatsApp. El invitado lo abre, carga su DNI y queda autorizado.

### Self-service onboarding + suscripción

1. `/signup` → elige plan.
2. `/signup/create` → crea org + admin user + slug.
3. Si el plan es pago: redirige a Mercado Pago para autorizar débito mensual.
4. MP nos avisa por webhook → actualizamos `subscriptions.status` y `organizations.status`.
5. Si dejan de pagar: banner amarillo → suspendido a los 7 días → solo el guardia sigue operativo en modo read-only.

## Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # solo backend, NUNCA al cliente
MP_ACCESS_TOKEN=              # token de Mercado Pago (sandbox o prod)
```

## Verificación end-to-end

Con dev server corriendo y org `test` creada:

1. Cargar 2-3 residentes en `/admin/residents`.
2. En `/resident/authorize` cargar una visita con DNI X.
3. En `/guard` tipear el DNI X + Enter → pantalla verde → "Registrar ingreso" → tilde.
4. Ver el evento en tiempo real en `/admin/events`.
5. Tipear un DNI desconocido → amarillo → "Forzar ingreso" → ver en eventos con resultado "forced".
6. DevTools → Network → Offline. Hacer 2 scans más → ven "Guardado (offline)" + contador "2 en cola".
7. Volver Network → Online. En 15s la cola se vacía sola y los eventos aparecen en `/admin/events`.

Si los 7 pasos pasan, todas las fases funcionan.

## Scripts

```bash
npm run dev     # dev server con Turbopack
npm run build   # build de producción
npm run start   # correr el build
npm run lint    # eslint
```
