import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function Home() {
  const org = await getCurrentOrg();

  if (org) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold mb-2">{org.name}</h1>
          <p className="text-zinc-400 mb-8">Bienvenido. Elegí cómo querés ingresar.</p>
          <div className="flex flex-col gap-3">
            <Link href="/guard" className="bg-emerald-600 hover:bg-emerald-500 font-semibold py-4 rounded-xl">
              Control de Acceso (Guardia)
            </Link>
            <Link href="/admin" className="bg-zinc-800 hover:bg-zinc-700 font-semibold py-4 rounded-xl">
              Administración
            </Link>
            <Link href="/login" className="text-zinc-500 hover:text-zinc-300 text-sm py-2">
              Iniciar sesión
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
      <div className="text-center max-w-xl">
        <h1 className="text-5xl font-bold mb-4">interapp</h1>
        <p className="text-xl text-zinc-400 mb-8">
          Control de accesos para barrios, countries, edificios y parques industriales.
          Rápido, simple, confiable.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/signup"
            className="bg-white text-zinc-950 hover:bg-zinc-200 font-semibold px-6 py-3 rounded-xl"
          >
            Crear mi barrio
          </Link>
          <Link
            href="/login"
            className="bg-zinc-800 hover:bg-zinc-700 font-semibold px-6 py-3 rounded-xl"
          >
            Iniciar sesión
          </Link>
        </div>
        <p className="text-zinc-600 text-sm mt-8">
          ¿Ya tenés un barrio creado? Accedé desde tu subdominio, ej:{" "}
          <code className="bg-zinc-900 px-2 py-1 rounded">losalamos.interapp.com</code>
        </p>
      </div>
    </main>
  );
}
