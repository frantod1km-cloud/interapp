import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import Landing from "@/components/landing/Landing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const org = await getCurrentOrg();

  // --- Estamos en un subdominio de barrio ---
  if (org) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Si está logueado, redirigir según el rol que tiene en ESTA org.
    // No mostramos un selector — cada usuario tiene un único destino.
    if (user) {
      const role = await getCurrentMemberRole(org.id);
      if (role === "guard" || role === "guard_lead") redirect("/guard");
      if (role === "org_admin") redirect("/admin");
      if (role === "resident") redirect("/resident");
      // Usuario logueado pero NO miembro de esta org: pantalla de aviso
      return (
        <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold mb-2">{org.name}</h1>
            <p className="text-zinc-400 mb-6">
              Tu usuario no tiene acceso a este barrio. Pedile a la administración que te dé de alta.
            </p>
            <form action="/api/logout" method="post">
              <button className="text-zinc-400 hover:text-zinc-400 text-sm underline">
                Cerrar sesión
              </button>
            </form>
          </div>
        </main>
      );
    }

    // No logueado: solo nombre del barrio + botón único de login.
    // NO revelamos las rutas /guard, /admin, /resident.
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
        <div className="text-center max-w-sm w-full">
          <h1 className="text-3xl font-bold mb-2">{org.name}</h1>
          <p className="text-zinc-400 mb-8">Iniciá sesión para acceder.</p>
          <Link
            href="/login"
            className="block bg-emerald-600 hover:bg-emerald-500 font-semibold py-4 rounded-xl"
          >
            Iniciar sesión
          </Link>
        </div>
      </main>
    );
  }

  // --- No hay subdominio: si estás logueado como super admin te llevo
  //     directo al panel. Si no, landing pública. ---
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isSuper =
    (user?.user_metadata as { is_super?: boolean } | null)?.is_super === true;
  if (isSuper) redirect("/super");

  return <Landing />;
}
