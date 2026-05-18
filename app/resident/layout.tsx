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
      <main className="min-h-screen flex items-center justify-center p-8 bg-white text-zinc-900">
        <p>Esta sección es para residentes del barrio.</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <SubscriptionBanner org={org} />
      <header className="border-b border-zinc-200 px-4 py-3 flex items-center justify-between sm:px-6">
        <div className="font-bold text-sm sm:text-base">{org.name}</div>
        <nav className="flex gap-3 text-sm text-zinc-700 items-center">
          <Link href="/resident" className="hover:text-zinc-900">Visitas</Link>
          <Link href="/resident/people" className="hover:text-zinc-900">Empleados</Link>
          <Link href="/resident/packages" className="hover:text-zinc-900">📦</Link>
          <Link href="/resident/marketplace" className="hover:text-zinc-900">🛒 Reservas</Link>
          <Link href="/resident/history" className="hover:text-zinc-900">Historial</Link>
          <form action="/api/logout" method="post">
            <button className="text-zinc-700 hover:text-zinc-900">Salir</button>
          </form>
        </nav>
      </header>
      <main className="p-4 sm:p-6 max-w-2xl mx-auto">{children}</main>
    </div>
  );
}
