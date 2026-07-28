import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// El panel super admin no vive bajo el subdominio de ninguna org.
// Acceso restringido por user_metadata.is_super = true (se setea a mano
// en Supabase Auth o vía /super/users cuando ya hay un super logueado).
//
// Bypass de RLS: las páginas adentro usan admin client (service_role)
// porque nuestro user no es miembro de cada org y RLS lo bloquearía.

const NAV: Array<{ href: string; label: string; icon: string }> = [
  { href: "/super", label: "Panel", icon: "📊" },
  { href: "/super/orgs", label: "Organizaciones", icon: "🏘️" },
  { href: "/super/users", label: "Usuarios", icon: "👤" },
  { href: "/super/billing", label: "Suscripciones", icon: "💳" },
  { href: "/super/audit", label: "Auditoría", icon: "📋" },
  { href: "/super/metrics", label: "Métricas", icon: "📈" },
  { href: "/super/config", label: "Config", icon: "⚙️" },
];

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?super=1");

  const isSuper = (user.user_metadata as { is_super?: boolean } | null)?.is_super === true;
  if (!isSuper) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-zinc-950 text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <p className="mb-4">Esta sección es solo para administradores de la plataforma.</p>
          <form action="/api/logout" method="post">
            <button className="text-sm text-zinc-400 underline hover:text-white">
              Cerrar sesión
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 sticky top-0 z-30 bg-zinc-950/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="font-bold text-lg mr-2">
            interapp <span className="text-emerald-400 text-xs">super</span>
          </div>
          <nav className="flex gap-1 flex-wrap flex-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-sm px-3 py-1.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
              >
                <span className="mr-1">{n.icon}</span> {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>{user.email}</span>
            <form action="/api/logout" method="post">
              <button className="hover:text-white underline">Salir</button>
            </form>
          </div>
        </div>
      </header>
      <main className="p-6 max-w-7xl mx-auto">{children}</main>
    </div>
  );
}
