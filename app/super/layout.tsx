import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// El panel super admin no vive bajo el subdominio de ninguna org.
// Acceso restringido por user_metadata.is_super = true (lo seteamos a mano
// en el dashboard de Supabase para los usuarios que somos nosotros).
//
// Bypass de RLS: las páginas adentro usan el admin client (service_role)
// porque nuestro user no es miembro de cada org y RLS lo bloquearía.

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isSuper = (user.user_metadata as { is_super?: boolean } | null)?.is_super === true;
  if (!isSuper) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-white text-zinc-900">
        <p>Esta sección es solo para administradores de la plataforma.</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200 px-6 py-4 flex items-center gap-6">
        <div className="font-bold">interapp · super</div>
        <nav className="flex gap-4 text-sm text-zinc-700">
          <Link href="/super" className="hover:text-zinc-900">Organizaciones</Link>
          <Link href="/super/metrics" className="hover:text-zinc-900">Métricas</Link>
        </nav>
      </header>
      <main className="p-6 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
