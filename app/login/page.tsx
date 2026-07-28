import { headers } from "next/headers";
import LoginForm from "./LoginForm";
import FindOrgForm from "./FindOrgForm";

export const dynamic = "force-dynamic";

// Si estamos en un subdominio (header x-org-slug seteado por el proxy):
//   mostramos el form normal de email + contraseña.
// Si estamos en el dominio raíz (sin subdominio):
//   no tiene sentido loguearse acá para usuarios normales — la sesión queda
//   guardada para el dominio raíz y no se comparte con los subdominios.
//   Mostramos un selector de barrio que redirige a su subdominio para loguear ahí.
//
//   EXCEPCIÓN: si viene ?super=1, mostramos el form email/password igual.
//   Esa es la única forma de que el super admin de la plataforma se logueé
//   (su sesión sí tiene que estar en el dominio raíz porque /super vive ahí).

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ super?: string }>;
}) {
  const h = await headers();
  const slug = h.get("x-org-slug");
  const host = h.get("host") ?? "";
  const sp = await searchParams;

  if (slug) return <LoginForm />;
  if (sp.super === "1") return <LoginForm />;

  return <FindOrgForm host={host} />;
}
