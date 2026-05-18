import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { savePaymentSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PaymentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("org_payment_settings")
    .select("mp_access_token, mp_public_key, notify_emails, active, updated_at")
    .eq("organization_id", org.id)
    .maybeSingle();

  // Por seguridad solo mostramos el final del token para confirmar que está
  // cargado, no el token completo.
  const tokenHint = settings?.mp_access_token
    ? `••••${settings.mp_access_token.slice(-6)}`
    : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Configuración de cobros</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Conectá la cuenta de Mercado Pago del barrio para cobrar reservas, eventos y membresías
        del marketplace. El dinero va directo a esa cuenta, sin pasar por interapp.
      </p>

      {sp.saved && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-4 mb-4 text-sm">
          ✅ Configuración guardada.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="bg-sky-900/20 border border-sky-700/40 rounded-2xl p-5 mb-6">
        <h2 className="font-semibold mb-2">¿De dónde saco las credenciales?</h2>
        <ol className="text-sm text-zinc-400 space-y-1 list-decimal pl-5">
          <li>
            Entrá a{" "}
            <a
              href="https://www.mercadopago.com.ar/developers/panel/app"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-sky-300"
            >
              developers panel de Mercado Pago
            </a>{" "}
            con la cuenta del barrio.
          </li>
          <li>Creá una aplicación (Tipo: &quot;Pagos online&quot;).</li>
          <li>
            En la pestaña &quot;Credenciales de producción&quot;, copiá el{" "}
            <strong>Access Token</strong> y el <strong>Public Key</strong>.
          </li>
          <li>Pegalos abajo y guardá.</li>
        </ol>
      </div>

      <form action={savePaymentSettingsAction} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-sm mb-1 text-zinc-400">Access Token</label>
          <input
            type="password"
            name="mp_access_token"
            placeholder={tokenHint ? `Actual: ${tokenHint} — dejá vacío para no cambiar` : "APP_USR-..."}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 font-mono text-sm"
          />
          <p className="text-xs text-zinc-400 mt-1">
            Solo lo guardamos cifrado en la base. Nunca se muestra al cliente.
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1 text-zinc-400">Public Key</label>
          <input
            type="text"
            name="mp_public_key"
            defaultValue={settings?.mp_public_key ?? ""}
            placeholder="APP_USR-..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-sm mb-1 text-zinc-400">Email de notificaciones (opcional)</label>
          <input
            type="email"
            name="notify_emails"
            defaultValue={settings?.notify_emails ?? ""}
            placeholder="tesorero@barrio.com"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
          />
          <p className="text-xs text-zinc-400 mt-1">
            Dónde MP avisa al barrio cuando entra un pago. Configurable también desde el panel de MP.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            name="active"
            defaultChecked={settings?.active ?? false}
            className="w-4 h-4"
          />
          <span>Activar cobros del marketplace</span>
        </label>

        <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 font-semibold py-3 rounded-xl">
          Guardar configuración
        </button>
      </form>
    </div>
  );
}
