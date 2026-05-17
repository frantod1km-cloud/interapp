import { redirect } from "next/navigation";
import { getCurrentMemberRole, getCurrentOrg } from "@/lib/org";
import GuardScreen from "./GuardScreen";

export const dynamic = "force-dynamic";

export default async function GuardPage() {
  const org = await getCurrentOrg();
  if (!org) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Organización no encontrada</h1>
          <p className="text-zinc-400">
            Accedé desde el subdominio de tu barrio, ej:{" "}
            <code className="bg-zinc-900 px-2 py-1 rounded">losalamos.interapp.com</code>
          </p>
        </div>
      </main>
    );
  }

  const role = await getCurrentMemberRole(org.id);
  if (!role) redirect("/login");
  if (role !== "guard" && role !== "org_admin") {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p>No tenés permiso para acceder al control de accesos.</p>
      </main>
    );
  }

  return <GuardScreen orgName={org.name} />;
}
