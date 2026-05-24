import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDni } from "@/lib/dni/parse";
import { claimInviteAction } from "./actions";

export const dynamic = "force-dynamic";

// Página pública que abre el invitado desde el link compartido.
// No requiere login. Usa admin client porque el visitante anónimo no debería
// ver las policies finas — solo la auth puntual de su token.

export default async function ClaimInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: auth } = await admin
    .from("authorizations")
    .select(
      "id, invite_token, claimed_at, valid_until, notes, dni, visitor_name, residents(first_name, last_name), organizations(name)",
    )
    .eq("invite_token", token)
    .maybeSingle();

  if (!auth) notFound();

  const orgName = Array.isArray(auth.organizations)
    ? auth.organizations[0]?.name
    : (auth.organizations as { name: string } | null)?.name;
  const host = Array.isArray(auth.residents)
    ? auth.residents[0]
    : (auth.residents as { first_name: string; last_name: string } | null);

  const expired = new Date(auth.valid_until) < new Date();

  if (sp.done === "1" || auth.claimed_at) {
    // Generamos un QR con el DNI normalizado del visitante. El guardia lo
    // escanea con su pistola (o cualquier app) y dispara el mismo lookup
    // que con el DNI físico. SVG renderizado server-side, sin JS en el cliente.
    const dniForQr = auth.dni ?? "";
    const qrSvg = dniForQr
      ? await QRCode.toString(dniForQr, {
          type: "svg",
          margin: 1,
          width: 280,
          color: { dark: "#000000", light: "#FFFFFF" },
          errorCorrectionLevel: "M",
        })
      : null;

    return (
      <Wrap orgName={orgName}>
        <div className="text-center">
          <div className="text-4xl mb-2">✓</div>
          <h1 className="text-2xl font-bold mb-1">Listo</h1>
          <p className="text-zinc-400 text-sm mb-5">
            Mostrale este código al guardia en la entrada.
          </p>

          {qrSvg && (
            <div className="bg-white rounded-2xl p-4 inline-block mb-4 shadow-2xl">
              <div
                className="w-[260px] h-[260px] mx-auto"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            </div>
          )}

          {auth.visitor_name && (
            <p className="text-lg font-semibold">{auth.visitor_name}</p>
          )}
          {dniForQr && (
            <p className="text-sm text-zinc-400 tabular-nums">
              DNI {formatDni(dniForQr)}
            </p>
          )}
          {host && (
            <p className="text-xs text-zinc-500 mt-3">
              Invitación de {host.first_name} {host.last_name}
            </p>
          )}
          <p className="text-xs text-zinc-600 mt-4">
            💡 Sacá una captura por si perdés conexión cuando llegues.
          </p>
        </div>
      </Wrap>
    );
  }

  if (expired) {
    return (
      <Wrap orgName={orgName}>
        <div className="text-center">
          <div className="text-6xl mb-4">⌛</div>
          <h1 className="text-2xl font-bold mb-2">Invitación vencida</h1>
          <p className="text-zinc-400">Pedile al residente que te genere uno nuevo.</p>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap orgName={orgName}>
      <h1 className="text-2xl font-bold mb-2">Te invitaron a {orgName ?? "un barrio"}</h1>
      <p className="text-zinc-400 mb-1">
        Invitación de {host ? `${host.first_name} ${host.last_name}` : "un residente"}.
      </p>
      <p className="text-zinc-400 text-sm mb-6">
        Vence el {new Date(auth.valid_until).toLocaleString("es-AR")}.
      </p>

      <form action={claimInviteAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="block text-sm mb-1 text-zinc-400">Tu DNI</label>
          <input
            name="dni"
            inputMode="numeric"
            required
            autoFocus
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
          />
        </div>
        <div>
          <label className="block text-sm mb-1 text-zinc-400">Tu nombre completo</label>
          <input
            name="visitor_name"
            required
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
          />
        </div>
        {sp.error && <p className="text-rose-300 text-sm">{decodeURIComponent(sp.error)}</p>}
        <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 font-semibold py-4 rounded-xl">
          Confirmar
        </button>
      </form>
    </Wrap>
  );
}

function Wrap({ orgName, children }: { orgName?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 flex items-center justify-center">
      <div className="w-full max-w-md">
        {orgName && (
          <div className="text-center text-sm text-zinc-400 mb-6">{orgName}</div>
        )}
        {children}
      </div>
    </main>
  );
}
