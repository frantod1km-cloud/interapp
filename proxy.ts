import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Proxy (antes "middleware" en Next 15):
// 1. Resuelve el subdominio → organization slug y lo inyecta como header
//    "x-org-slug" en el REQUEST que llega a la página. Tiene que ir en el
//    request (no en la response) porque las páginas leen con headers() las
//    headers entrantes.
// 2. Refresca la sesión de Supabase en cada request (mantiene cookies vivas).
//
// Variable NEXT_PUBLIC_ROOT_DOMAIN: dominio raíz en producción (ej.
// "interapp.com.ar"). Si no está seteada, asumimos modo localhost.

const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").trim().toLowerCase();

export async function proxy(request: NextRequest) {
  // Calcular el slug del subdominio
  const host = request.headers.get("host") || "";
  const slug = resolveOrgSlug(host);

  // Headers del request modificados con el slug (para que getCurrentOrg lo
  // pueda leer desde headers())
  const forwardedHeaders = new Headers(request.headers);
  if (slug) forwardedHeaders.set("x-org-slug", slug);

  let response = NextResponse.next({
    request: { headers: forwardedHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: { headers: forwardedHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

function resolveOrgSlug(host: string): string | null {
  const hostname = host.split(":")[0].toLowerCase();

  // --- Desarrollo local ---
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    if (hostname.endsWith(".localhost")) {
      return hostname.replace(".localhost", "");
    }
    return null;
  }

  // --- Producción con NEXT_PUBLIC_ROOT_DOMAIN definido ---
  // Forma "estricta": solo aceptamos subdominios del dominio raíz que
  // configuramos. Esto evita problemas con previews de Vercel u otros hosts.
  if (ROOT_DOMAIN) {
    // Es exactamente el root o www.root → home pública
    if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return null;
    // Termina en .root → el slug es lo que está antes
    if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
      const slug = hostname.slice(0, -1 - ROOT_DOMAIN.length);
      // Slug no puede contener punto (significaría un sub-subdominio)
      if (slug.includes(".")) return null;
      return slug || null;
    }
    // Cualquier otro host (preview de Vercel, dominio raro) → null
    return null;
  }

  // --- Fallback: sin ROOT_DOMAIN configurado, parseamos heurísticamente ---
  const parts = hostname.split(".");
  if (parts.length < 3) return null;
  const first = parts[0];
  if (first === "www") return null;
  return first;
}

export const config = {
  matcher: [
    // Todo menos assets estáticos y _next
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
