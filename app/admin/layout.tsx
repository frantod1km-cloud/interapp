import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMemberRole, getCurrentOrg } from "@/lib/org";

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
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-6">
        <div className="font-bold">{org.name}</div>
        <nav className="flex gap-4 text-sm text-zinc-400">
          <Link href="/admin" className="hover:text-white">Dashboard</Link>
          <Link href="/admin/residents" className="hover:text-white">Residentes</Link>
          <Link href="/admin/events" className="hover:text-white">Eventos</Link>
          <Link href="/guard" className="hover:text-white">Modo Guardia</Link>
        </nav>
      </header>
      <main className="p-6 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
