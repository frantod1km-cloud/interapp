import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMemberRole, getCurrentOrg } from "@/lib/org";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";

export const dynamic = "force-dynamic";

export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const org = await getCurrentOrg();
  if (!org) redirect("/");

  const role = await getCurrentMemberRole(org.id);
  if (!role) redirect("/login");
  if (role !== "resident" && role !== "org_admin") {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-zinc-950 text-white">
        <p>Esta sección es para residentes del barrio.</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <SubscriptionBanner org={org} />
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between sm:px-6">
        <div className="font-bold text-sm sm:text-base">{org.name}</div>
        <nav className="flex gap-3 text-sm text-zinc-400 items-center">
          <Link href="/resident" className="hover:text-white">Visitas</Link>
          <Link href="/resident/people" className="hover:text-white">Empleados</Link>
          <Link href="/resident/packages" className="hover:text-white">📦</Link>
          <Link href="/resident/marketplace" className="hover:text-white">🛒 Reservas</Link>
          <Link href="/resident/history" className="hover:text-white">Historial</Link>
          <Link href="/resident/profile" className="hover:text-white">👤 Mi perfil</Link>
          <form action="/api/logout" method="post">
            <button className="text-zinc-400 hover:text-white">Salir</button>
          </form>
        </nav>
      </header>
      <main className="p-4 sm:p-6 max-w-2xl mx-auto">{children}</main>
    </div>
  );
}
