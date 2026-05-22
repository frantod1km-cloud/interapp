# interapp — Handoff para nuevo chat

Lo que tenés que saber para retomar este proyecto sin contexto previo.

## Qué es

**interapp** — SaaS multi-tenant de control de accesos para barrios privados, countries, edificios y parques industriales argentinos. Cada barrio = una organización aislada con su propio entorno (subdominio). El guardia escanea DNI con pistola PDF417 y aprueba/deniega ingresos. Residentes autorizan visitas desde su celular.

**Filosofía core:** la pantalla del guardia tiene que responder "¿esta persona puede entrar?" en menos de 2 segundos. Todo lo demás es accesorio.

## Stack

- **Next.js 16** (App Router, RSC, Server Actions, Turbopack) — el "middleware" se llama `proxy.ts` y la función exportada es `proxy()`, no `middleware()`.
- **Supabase** (Postgres + Auth + RLS + Storage) — multi-tenancy con Row Level Security desde el día 1.
- **Tailwind v4** — tema oscuro (`bg-zinc-950` / `text-white`). El usuario ya probó tema claro y lo descartó.
- **TypeScript** estricto.
- **Mercado Pago** Preapproval para suscripciones SaaS Y para que cada barrio cobre por marketplace (cada org configura su propio access token).
- **web-push** (VAPID) para notificaciones.
- **PWA** con Service Worker + IndexedDB offline.
- **Vercel** para deploy. Plan **Hobby (Free)** — los cron jobs solo pueden ser diarios, no más frecuentes.

## Usuario y forma de comunicarse

- **Idioma:** español rioplatense (vos, dale, etc.). No usar emojis salvo en UI/código.
- **Estilo:** directo, sin maquillaje. El usuario aprecia honestidad técnica.
- **Memoria importante** del usuario: "Una vez que aprueba un plan, ejecutar end-to-end sin preguntas." NO usar AskUserQuestion durante la ejecución a menos que sea decisión crítica.
- El usuario NO es programador. Explicaciones técnicas tienen que ser claras pero concretas.
- Si reporta un bug y manda screenshot, intentar diagnosticar sin pedirle 10 cosas más.
- Cuando termines algo, resumen corto con "qué cambió" y "cómo se prueba".

## Estado actual (2026-05-22)

- **20 migraciones SQL** corridas (`supabase/migrations/0001…0020`).
- **Repo en GitHub:** https://github.com/frantod1km-cloud/interapp
- **Deploy en Vercel:** activo en `interapp-ivory.vercel.app` pero **no es usable** porque el multi-tenant requiere subdominios y `vercel.app` no permite `*.vercel.app`.
- **Dominio comprado:** `bzseguridad.online` (DonWeb). Configurado en Vercel con nameservers Vercel, status Active. Falta agregar el wildcard `*.bzseguridad.online` y setear `NEXT_PUBLIC_ROOT_DOMAIN=bzseguridad.online` en Vercel env vars.
- **Dev local:** `npm run dev` levanta en `localhost:3000`. Funciona perfecto con subdominios `*.localhost:3000` (los navegadores resuelven automáticamente).
- **Pagos Mercado Pago:** no configurado todavía (env vars vacías).
- **VAPID:** no configurado todavía (env vars vacías).

## Arquitectura clave

### Multi-tenancy
- Cada barrio = una row en `organizations` con `slug` único.
- Subdominio resuelve a org en `proxy.ts` que inyecta el header `x-org-slug` al request.
- `getCurrentOrg()` en `lib/org.ts` lo lee con `headers()`.
- **Todas las tablas de negocio tienen `organization_id`** y **policies RLS** que filtran por `current_user_org_ids()`.

### Roles (`org_members.role`)
- `super_admin` — nosotros, ven todas las orgs (gated por `user_metadata.is_super=true`)
- `org_admin` — manda en el barrio
- `guard_lead` — jefe de guardia (puede crear otros guardias)
- `guard` — solo control de acceso
- `resident` — autoriza visitas, su panel

### Categorías de residentes (`residents.kind`)
`owner` | `tenant` | `family` | `staff` | `domestic` | `contractor` | `other`

`staff` = empleados del barrio (admin). `domestic`/`contractor` = empleados de un residente (cada residente los gestiona desde `/resident/people`).

### Modelo de personas
- `residents` table: TODAS las personas con acceso permanente (no solo "propietarios"). El campo `kind` distingue.
- `authorized_by_resident_id` (nullable): si está seteado, esta persona fue autorizada por ese residente (ej. la empleada doméstica de Pedro).
- `authorizations` table: visitas TEMPORALES (un día, un evento). Diferente a `residents`.

### Pantalla del guardia (`app/guard/GuardScreen.tsx`)
- Input invisible con focus permanente (la pistola tipea ahí).
- Estados: idle, checking, result (authorized/expired/out_of_window/access_expired/unknown), confirmed, error.
- Cada estado tiene color: verde (autorizado), amarillo (vencido/desconocido), naranja (fuera de horario), rojo (acceso vencido), gris (idle).
- Selector de vehículo (chips o "Sin auto" o "Otra patente" + marca/modelo/color).
- Lista de acompañantes (con DNI y nombre, no contador).
- Botones: "Registrar entrada/salida" + "Cancelar" + en warnings también "Forzar" y "Denegar paso".
- Botones del header: 🔍 Buscar (búsqueda por nombre/DNI), 📦 Paquetes, Supervisión (solo lead), Salir.
- Offline-first: snapshot en IndexedDB + cola de eventos pendientes.

## Decisiones importantes que NO hay que revertir

1. **Tema oscuro.** Usuario probó claro y volvimos a oscuro.
2. **Cron diario** (no horario) por plan Hobby de Vercel.
3. **Logout redirige a `/login` del subdominio**, no a `/`.
4. **Las reglas horarias son POR PERSONA** (en `residents.weekday_mask/start_hour/end_hour/rule_enabled`), no por categoría global. Solo `kind='staff'` puede tener regla global (en tabla `access_rules`, hoy deprecada porque `/admin/empleados` los gestiona individualmente).
5. **El "buscador" del guard usa modal client-side** que llama a `/api/guard/search` con debounce.
6. **Acompañantes son personas concretas** (DNI+nombre), no un contador.
7. **`refocus()` chequea `modalOpenRef`** para no robarle focus a inputs cuando hay modales abiertos. Y usa `preventScroll: true` para no saltar al top de la página.
8. **`proxy.ts` valida estrictamente el dominio raíz** vía `NEXT_PUBLIC_ROOT_DOMAIN` en producción. Sin esa var solo funciona localhost.
9. **WeekdayPicker sin atajos** — solo los 7 chips de día individual, el usuario los quería así.

## Comandos útiles

```bash
npm run dev        # dev server (Turbopack)
npm run build      # build completo
npm run vapid      # genera VAPID keys e imprime las líneas para Vercel
```

## Bugs conocidos / Pendientes que el usuario pidió

Ninguno crítico abierto. Lo último que se entregó:
- Empleados del barrio (CRUD completo con cargo/empresa/contrato) en `/admin/empleados`
- Personal por residente en `/admin/personal-por-residente`
- Buscadores en residents/vehicles/packages
- Categoría "Otro"
- WeekdayPicker sin atajos
- VehicleResidentPicker con buscador

## Próximos pasos lógicos

El usuario está en proceso de **configurar el dominio en Vercel**. Le falta:
1. Agregar `*.bzseguridad.online` (wildcard) en Vercel → Project → Settings → Domains
2. Setear `NEXT_PUBLIC_ROOT_DOMAIN=bzseguridad.online` en Vercel env vars
3. Redeploy
4. Probar que `bzseguridad.online/signup` funciona y crea un barrio en `xxx.bzseguridad.online`

Después de eso lo natural es:
- Configurar Mercado Pago (token + webhook secret) para que el SaaS cobre suscripciones
- Configurar VAPID para notificaciones push
- Sumar buscador en marketplace (reservas)
- Eventualmente: política de privacidad, términos de uso, dominio en Supabase para emails

## Reglas para vos

- **NO commitees automáticamente.** Solo si el usuario lo pide. Después de cada cambio significativo ofrecele.
- **Usá `git push` cuando commitees** (el remote está configurado, los push triggerean deploy en Vercel automáticamente).
- **Migraciones nuevas:** numerar 0021, 0022, etc. SIEMPRE actualizar `supabase/all.sql` regenerándolo:
  ```bash
  cd supabase/migrations && {
    echo "-- header"
    for f in $(ls 00*.sql | sort); do echo "-- $f"; cat $f; done
  } > ../all.sql
  ```
- **Bug en RLS:** si tocás policies de `residents` o tablas que la referencian, cuidado con recursión infinita. Usar SECURITY DEFINER helpers como `current_user_resident_ids()` o `current_user_managed_resident_ids()`.
- **Service role:** solo para acciones donde hace falta bypassar RLS. Filtrar SIEMPRE por `organization_id` explícitamente.
- **No usar `redirect` ni operaciones destructivas sin pensar.**

## Archivos clave para leer al arrancar

1. `DEPLOY.md` — guía de deploy completa
2. `proxy.ts` — resolución de subdominio + auth refresh
3. `lib/org.ts` — `getCurrentOrg()` y `getCurrentMemberRole()`
4. `lib/access/lookup.ts` — el "cerebro" del lookup del guardia (residente vs visitante vs unknown, vehículos, reservas, paquetes, regla horaria, expiración)
5. `app/guard/GuardScreen.tsx` — pantalla del guardia (componente grande, ~1100 líneas)
6. `supabase/migrations/` — todo el schema; mirar en orden si necesitás entender el modelo

@AGENTS.md
