import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMemberRole, getCurrentOrg } from "@/lib/org";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const org = await getCurrentOrg();
  if (!org) redirect("/");

  const role = await getCurrentMemberRole(org.id);
  if (!role) redirect("/login");
  if (role !== "org_admin") {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-zinc-950 text-white">
        <p>No tenés permisos de administrador.</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <SubscriptionBanner org={org} />
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-6">
        <div className="font-bold">{org.name}</div>
        <nav className="flex gap-4 text-sm text-zinc-400 flex-wrap">
          <Link href="/admin" className="hover:text-white">Dashboard</Link>
          <Link href="/admin/residents" className="hover:text-white">Residentes</Link>
          <Link href="/admin/vehicles" className="hover:text-white">Vehículos</Link>
          <Link href="/admin/guards" className="hover:text-white">Guardias</Link>
          <Link href="/admin/events" className="hover:text-white">Eventos</Link>
          <Link href="/admin/billing" className="hover:text-white">Facturación</Link>
        </nav>
        <form action="/api/logout" method="post" className="ml-auto">
          <button className="text-sm text-zinc-500 hover:text-white">Salir</button>
        </form>
      </header>
      <main className="p-6 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
