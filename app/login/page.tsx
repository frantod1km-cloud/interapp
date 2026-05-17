import { headers } from "next/headers";
import LoginForm from "./LoginForm";
import FindOrgForm from "./FindOrgForm";

export const dynamic = "force-dynamic";

// Si estamos en un subdominio (header x-org-slug seteado por el proxy):
//   mostramos el form normal de email + contraseña.
// Si estamos en el dominio raíz (sin subdominio):
//   no tiene sentido loguearse acá porque la sesión queda guardada para el
//   dominio raíz y no se comparte con los subdominios. Mostramos un selector
//   de barrio que redirige a su subdominio para loguear ahí.

export default async function LoginPage() {
  const h = await headers();
  const slug = h.get("x-org-slug");
  const host = h.get("host") ?? "";

  if (slug) {
    return <LoginForm />;
  }

  return <FindOrgForm host={host} />;
}
