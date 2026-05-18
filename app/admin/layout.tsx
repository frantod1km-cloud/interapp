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
      <main className="min-h-screen flex items-center justify-center p-8 bg-white text-zinc-900">
        <p>No tenés permisos de administrador.</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <SubscriptionBanner org={org} />
      <header className="border-b border-zinc-200 px-6 py-4 flex items-center gap-6">
        <div className="font-bold">{org.name}</div>
        <nav className="flex gap-4 text-sm text-zinc-700 flex-wrap">
          <Link href="/admin" className="hover:text-zinc-900">Dashboard</Link>
          <Link href="/admin/residents" className="hover:text-zinc-900">Residentes</Link>
          <Link href="/admin/vehicles" className="hover:text-zinc-900">Vehículos</Link>
          <Link href="/admin/packages" className="hover:text-zinc-900">📦 Paquetes</Link>
          <Link href="/admin/marketplace" className="hover:text-zinc-900">🛒 Marketplace</Link>
          <Link href="/admin/access-rules" className="hover:text-zinc-900">Reglas</Link>
          <Link href="/admin/guards" className="hover:text-zinc-900">Guardias</Link>
          <Link href="/admin/gates" className="hover:text-zinc-900">Garitas</Link>
          <Link href="/admin/events" className="hover:text-zinc-900">Ingresos</Link>
          <Link href="/admin/reports" className="hover:text-zinc-900">Reportes</Link>
          <Link href="/admin/audit" className="hover:text-zinc-900">Auditoría</Link>
          <Link href="/admin/billing" className="hover:text-zinc-900">Facturación</Link>
        </nav>
        <form action="/api/logout" method="post" className="ml-auto">
          <button className="text-sm text-zinc-700 hover:text-zinc-900">Salir</button>
        </form>
      </header>
      <main className="p-6 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
