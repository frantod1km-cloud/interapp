import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cierra la sesión y redirige a /login del MISMO subdominio para evitar
// pasar por la home (que muestra una pantalla intermedia con botón). Usar
// req.url asegura que el redirect mantiene el host del subdominio actual.
export async function POST(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
