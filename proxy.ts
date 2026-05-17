import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Middleware:
// 1. Refresca la sesión de Supabase en cada request (mantiene cookies vivas).
// 2. Resuelve el subdominio → organization slug y lo pasa por header `x-org-slug`.
//    Ej: losalamos.interapp.com → slug = "losalamos"
//    En localhost (sin subdominio), permite pasar y la app cae al onboarding.

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();

  const host = request.headers.get("host") || "";
  const slug = resolveOrgSlug(host);
  if (slug) {
    response.headers.set("x-org-slug", slug);
  }

  return response;
}

function resolveOrgSlug(host: string): string | null {
  const hostname = host.split(":")[0]; // saca puerto
  // localhost / 127.0.0.1 → no hay subdominio
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    // Soporte para "losalamos.localhost:3000" en desarrollo
    if (hostname.endsWith(".localhost")) {
      return hostname.replace(".localhost", "");
    }
    return null;
  }

  const parts = hostname.split(".");
  // foo.interapp.com → ["foo","interapp","com"] → slug = foo
  // www.interapp.com → ["www","interapp","com"] → slug = null (raíz)
  // interapp.com → ["interapp","com"] → slug = null
  if (parts.length < 3) return null;
  const first = parts[0];
  if (first === "www") return null;
  return first;
}

export const config = {
  matcher: [
    // Todo menos assets estáticos y _next
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
