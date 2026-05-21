# Deploy a producción (Vercel + Supabase + Mercado Pago)

Guía completa, paso a paso, para llevar interapp a un dominio real.

> **Antes de empezar:** asumimos que tenés cuenta en GitHub, Vercel, Supabase y Mercado Pago. Y un dominio comprado (ej. `interapp.com.ar` en Nic.ar).

---

## 1. Repositorio en GitHub

1. Creá un repo nuevo en GitHub (privado): https://github.com/new
2. Desde una terminal en la carpeta del proyecto:
   ```bash
   git remote add origin https://github.com/TU-USUARIO/interapp.git
   git branch -M main
   git push -u origin main
   ```

---

## 2. Supabase (base de datos + auth + storage)

### 2.1 — Crear el proyecto

1. Andá a https://app.supabase.com → **New Project**.
2. Nombre: `interapp-prod` (o lo que prefieras).
3. Database password: **anotala** en un lugar seguro.
4. Region: la más cercana a tus usuarios (ej. `South America (São Paulo)`).
5. Plan: Free para arrancar; Pro cuando empieces a tener clientes.

### 2.2 — Correr todas las migraciones de una

1. En Supabase: **SQL Editor → New query**.
2. Abrí en tu editor el archivo `supabase/all.sql` (es la concatenación de todas las migrations `0001…0019`).
3. Copiá todo el contenido.
4. Pegá en el SQL Editor y dale **Run**.
5. Esperá unos segundos. Debería decir "Success" en verde.

> Si tirara error de "Failed to fetch", reintentá (problema transient de Supabase). Si tira un error SQL específico, copialo y mandámelo.

### 2.3 — Habilitar el bucket de Storage para fotos de paquetes

Ya viene creado por la migration `0009_packages.sql` (`insert into storage.buckets…`). Verificá que esté: **Storage → Buckets → `packages`**. Tiene que ser **público** y permitir image/jpeg|png|webp.

### 2.4 — Tomar las credenciales

**Settings → API**. Anotá:
- `Project URL` → será `NEXT_PUBLIC_SUPABASE_URL`
- `anon` `public` key → será `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` `secret` key → será `SUPABASE_SERVICE_ROLE_KEY` (**nunca compartas esta**)

---

## 3. Dominio y Vercel

### 3.1 — Importar el proyecto

1. https://vercel.com/new → **Import** del repo de GitHub.
2. Framework Preset: **Next.js** (lo detecta solo).
3. Root directory: `./` (default).
4. **NO deployees todavía** — primero seteamos las env vars.

### 3.2 — Configurar variables de entorno

En **Project Settings → Environment Variables**, agregá (production environment):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | El URL del paso 2.4 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | La anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | La service_role key |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Tu dominio raíz, ej. `interapp.com.ar` (sin `https://`, sin barra) |
| `MP_ACCESS_TOKEN` | (ver paso 4) |
| `MP_WEBHOOK_SECRET` | (ver paso 4) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | (ver paso 5) |
| `VAPID_PRIVATE_KEY` | (ver paso 5) |
| `VAPID_SUBJECT` | `mailto:soporte@TU-DOMINIO.com` |
| `CRON_SECRET` | Generá uno random: `openssl rand -hex 32` |

### 3.3 — Conectar el dominio

1. **Settings → Domains**.
2. Agregá `interapp.com.ar` (o tu dominio raíz). Seguí las instrucciones de DNS que te da Vercel (suele ser un A record o NS records).
3. **Importante**: agregá también `*.interapp.com.ar` (wildcard) para que cualquier subdominio resuelva al mismo proyecto.
4. Esperá ~10-30 min a que propague el DNS. Verificá con https://dnschecker.org.

### 3.4 — Deploy

**Deployments → Redeploy** (o pusheá un commit nuevo). Esperá a que termine. Si todo está bien:
- `https://interapp.com.ar` → landing pública
- `https://test.interapp.com.ar` → si no creaste el barrio "test", te dice "Iniciá sesión"

---

## 4. Mercado Pago (cobros recurrentes)

> Si en MVP no vas a cobrar (todos los barrios en trial), podés saltar esto y dejar `MP_ACCESS_TOKEN` vacío. Los signups en plan trial siguen andando.

### 4.1 — Crear app en MP

1. https://www.mercadopago.com.ar/developers/panel/app → **Crear aplicación**.
2. Producto: **Suscripciones**.
3. Sacá:
   - **Access Token de Producción** → `MP_ACCESS_TOKEN`

### 4.2 — Configurar el webhook

1. En tu app de MP → **Notificaciones (webhooks)**.
2. URL del webhook: `https://interapp.com.ar/api/mercadopago/webhook`
3. Eventos: marcá **Preapproval (suscripciones)**.
4. Generá una **Clave secreta** → será `MP_WEBHOOK_SECRET`.
5. Guardar y poné las dos variables en Vercel.

### 4.3 — Redeploy

Después de actualizar env vars de MP, Vercel necesita un redeploy para tomarlas.

---

## 5. VAPID keys (web push notifications)

Generá las claves desde tu máquina local:

```bash
npm run vapid
```

Te imprime 3 líneas listas para copiar a Vercel:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BAbc...
VAPID_PRIVATE_KEY=xyz...
VAPID_SUBJECT=mailto:soporte@TU-DOMINIO.com
```

**Importante:** cambiá el `mailto:` a un email tuyo real. Los servidores de push de Google/Mozilla/Apple lo usan si tu app abusa de notificaciones.

Pegá las 3 en Vercel y hacé redeploy.

---

## 6. Cron jobs

El archivo `vercel.json` ya incluye un cron de recordatorios de paquetes cada hora. Vercel lo crea automáticamente cuando hay `vercel.json` en el repo. Verificá en **Settings → Cron Jobs** que aparezca.

---

## 7. Crear el primer super admin (vos)

1. Logueate en `interapp.com.ar/signup` y creá un barrio de prueba (ej. `demo`).
2. En Supabase → **Authentication → Users** buscá tu usuario.
3. Editá → **Raw User Meta Data** → pegá:
   ```json
   { "is_super": true }
   ```
4. Save.

Ahora tenés acceso a `interapp.com.ar/super` (panel global para gestionar todas las orgs).

---

## 8. Verificar todo

Hacé este recorrido para confirmar que todo anda:

- [ ] `interapp.com.ar` muestra la landing pública.
- [ ] `interapp.com.ar/api/health` devuelve `{"ok": true, "db": "ok"}`.
- [ ] `interapp.com.ar/signup` deja crear un barrio.
- [ ] Después del signup te redirige a `nuevobarrio.interapp.com.ar/login?welcome=1`.
- [ ] Logueás y te tira a `/admin`.
- [ ] Podés cargar un residente.
- [ ] Como guardia o admin, escaneás/tipeás el DNI del residente y aparece verde.
- [ ] Activás notificaciones desde el panel del residente y al confirmar un ingreso te llega push.

---

## 9. Soporte / mantenimiento

- **Backups**: Supabase hace daily backups en el plan Pro. Plan Free los hace pero retención 7 días.
- **Logs**: Vercel → **Logs** (live tail). Errores de server actions aparecen ahí.
- **Métricas**: Vercel → **Analytics** (incluido en Pro).
- **Uptime**: configurá [UptimeRobot](https://uptimerobot.com) (gratis) apuntando a `/api/health` con check cada 5 min.

---

## 10. Cosas a hacer una sola vez después del primer deploy

- [ ] Sumar política de privacidad y términos en `/legal/privacy` y `/legal/terms` (Mercado Pago suele pedir esto).
- [ ] Configurar email transaccional (Supabase usa el suyo por defecto, pero podés conectar Resend/Postmark/SES en Authentication → Email Templates).
- [ ] Sumar dominio personalizado al sitio (`interapp.com.ar`) en Supabase para los emails de recuperación (Authentication → URL Configuration).
- [ ] Configurar CSP, rate limiting más estricto, monitoring de errores (Sentry).

---

## Troubleshooting rápido

- **"Organización no encontrada"** al entrar a un subdominio → verificá que `NEXT_PUBLIC_ROOT_DOMAIN` esté seteada y que hayas creado ese barrio en la DB.
- **Push notifications no llegan** → confirmá las 3 vars VAPID y que el residente haya tocado "Activar notificaciones".
- **Mercado Pago webhook devuelve 401** → la firma no coincide. Revisá que `MP_WEBHOOK_SECRET` sea idéntica a la que copiaste de tu app de MP.
- **Build falla en Vercel** → mirá los logs. Suele ser una env var faltante (TypeScript se queja si usás `process.env.X!`).
