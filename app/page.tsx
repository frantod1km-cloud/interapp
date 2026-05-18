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
        <main className="min-h-screen bg-white text-zinc-900 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold mb-2">{org.name}</h1>
            <p className="text-zinc-700 mb-6">
              Tu usuario no tiene acceso a este barrio. Pedile a la administración que te dé de alta.
            </p>
            <form action="/api/logout" method="post">
              <button className="text-zinc-700 hover:text-zinc-700 text-sm underline">
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
      <main className="min-h-screen bg-white text-zinc-900 flex items-center justify-center p-8">
        <div className="text-center max-w-sm w-full">
          <h1 className="text-3xl font-bold mb-2">{org.name}</h1>
          <p className="text-zinc-700 mb-8">Iniciá sesión para acceder.</p>
          <Link
            href="/login"
            className="block bg-blue-600 hover:bg-blue-500 font-semibold py-4 rounded-xl"
          >
            Iniciar sesión
          </Link>
        </div>
      </main>
    );
  }

  // --- No hay subdominio: landing pública de interapp ---
  return <Landing />;
}
