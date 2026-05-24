import { NextResponse } from "next/server";
import { getCurrentOrg, getCurrentMemberRole } from "@/lib/org";
import { lookupDni } from "@/lib/access/lookup";
import { normalizeDni } from "@/lib/dni/parse";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const org = await getCurrentOrg();
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 404 });

  const role = await getCurrentMemberRole(org.id);
  if (role !== "guard" && role !== "org_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const dni = normalizeDni(url.searchParams.get("dni") ?? "");
  if (!dni) return NextResponse.json({ error: "bad_dni" }, { status: 400 });

  const result = await lookupDni(org.id, dni);
  return NextResponse.json(result);
}
