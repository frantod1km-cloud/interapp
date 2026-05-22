import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrg } from "@/lib/org";
import { formatDni } from "@/lib/dni/parse";
import { RESIDENT_KINDS } from "@/lib/resident-kinds";
import { addResidentAction, toggleResidentActiveAction } from "./actions";
import InviteButton from "./InviteButton";
import KindSelector from "./KindSelector";

export const dynamic = "force-dynamic";

export default async function ResidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; error?: string; kind?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const org = (await getCurrentOrg())!;
  const admin = createAdminClient();

  let query = admin
    .from("residents")
    .select("id, dni, first_name, last_name, unit, phone, active, user_id, kind, created_at, authorized_by_resident_id")
    .eq("organization_id", org.id)
    .order("last_name");

  if (sp.kind && RESIDENT_KINDS.some((k) => k.id === sp.kind)) {
    query = query.eq("kind", sp.kind);
  }

  // Buscador: por nombre, apellido, DNI parcial o unidad
  if (sp.q && sp.q.trim()) {
    const term = sp.q.trim();
    const digits = term.replace(/\D/g, "");
    if (digits.length >= 3) {
      query = query.ilike("dni", `%${digits}%`);
    } else {
      const safe = term.replace(/[%_]/g, (c) => `\\${c}`);
      query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,unit.ilike.%${safe}%`);
    }
  }

  const { data: residents } = await query;

  const emailsMap = new Map<string, string>();
  for (const r of residents ?? []) {
    if (r.user_id) {
      const { data: u } = await admin.auth.admin.getUserById(r.user_id);
      if (u?.user?.email) emailsMap.set(r.user_id, u.user.email);
    }
  }

  // Diccionario de "autorizado por" → "Apellido, Nombre"
  const authorizerIds = Array.from(
    new Set((residents ?? []).map((r) => r.authorized_by_resident_id).filter(Boolean) as string[]),
  );
  const authorizers = new Map<string, string>();
  if (authorizerIds.length > 0) {
    const { data: arr } = await admin
      .from("residents")
      .select("id, first_name, last_name")
      .in("id", authorizerIds);
    for (const a of arr ?? []) {
      authorizers.set(a.id, `${a.last_name}, ${a.first_name}`);
    }
  }

  // Conteo por categoría (para los filtros)
  const { data: allForCount } = await admin
    .from("residents")
    .select("kind")
    .eq("organization_id", org.id);
  const countsByKind = new Map<string, number>();
  for (const r of allForCount ?? []) {
    countsByKind.set(r.kind, (countsByKind.get(r.kind) ?? 0) + 1);
  }
  const totalCount = allForCount?.length ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Personas con acceso</h1>
        <Link
          href="/admin/residents/import"
          className="bg-zinc-800 hover:bg-zinc-700 text-sm px-4 py-2 rounded-lg font-medium"
        >
          📋 Importar CSV
        </Link>
      </div>
      <p className="text-zinc-400 text-sm mb-6">
        Cargá residentes, empleados del barrio, empleadas domésticas y otros con acceso recurrente.
        La <strong>categoría</strong> es informativa para el guardia y para vos al filtrar.
      </p>

      {sp.invited && (
        <div className="bg-emerald-600/20 border border-emerald-600/40 rounded-2xl p-4 mb-4 text-sm">
          ✅ Cuenta creada.
        </div>
      )}
      {sp.error && (
        <div className="bg-rose-700/20 border border-rose-700/40 rounded-2xl p-4 mb-4 text-sm text-rose-300">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Buscador */}
      <form method="get" className="flex gap-2 mb-3">
        {sp.kind && <input type="hidden" name="kind" value={sp.kind} />}
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar por nombre, apellido, DNI o unidad…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm"
        />
        <button className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2 text-sm">
          Buscar
        </button>
        {sp.q && (
          <Link
            href={sp.kind ? `/admin/residents?kind=${sp.kind}` : "/admin/residents"}
            className="text-sm text-zinc-400 hover:text-white self-center px-3"
          >
            Limpiar
          </Link>
        )}
      </form>

      {/* Filtros por categoría */}
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterChip href={sp.q ? `/admin/residents?q=${encodeURIComponent(sp.q)}` : "/admin/residents"} active={!sp.kind} label={`Todos (${totalCount})`} />
        {RESIDENT_KINDS.map((k) => (
          <FilterChip
            key={k.id}
            href={`/admin/residents?kind=${k.id}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
            active={sp.kind === k.id}
            label={`${k.emoji} ${k.short} (${countsByKind.get(k.id) ?? 0})`}
          />
        ))}
      </div>

      <form
        action={addResidentAction}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-7 gap-3"
      >
        <select name="kind" defaultValue="owner" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800">
          {RESIDENT_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.emoji} {k.short}
            </option>
          ))}
        </select>
        <input name="dni" placeholder="DNI" required className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <input name="first_name" placeholder="Nombre" required className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <input name="last_name" placeholder="Apellido" required className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <input name="unit" placeholder="Lote / Depto" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <input name="phone" placeholder="Teléfono" className="bg-zinc-950 rounded px-3 py-2 border border-zinc-800" />
        <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 font-semibold rounded px-4 py-2">
          Agregar
        </button>
      </form>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Apellido y Nombre</th>
              <th className="px-4 py-3">DNI</th>
              <th className="px-4 py-3">Unidad / Autorizado por</th>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(residents ?? []).map((r) => {
              const email = r.user_id ? emailsMap.get(r.user_id) : null;
              return (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3">
                    <KindSelector residentId={r.id} currentKind={r.kind} />
                  </td>
                  <td className="px-4 py-3 font-medium">{r.last_name}, {r.first_name}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDni(r.dni)}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.unit ? (
                      <span>{r.unit}</span>
                    ) : r.authorized_by_resident_id ? (
                      <span className="text-xs text-sky-300">
                        🔗 {authorizers.get(r.authorized_by_resident_id) ?? "Residente"}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {email ? (
                      <span className="text-emerald-400">{email}</span>
                    ) : (
                      <span className="text-zinc-400">Sin cuenta</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.active ? (
                      <span className="text-emerald-400">Activo</span>
                    ) : (
                      <span className="text-zinc-400">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      {!email && (
                        <InviteButton residentId={r.id} fullName={`${r.first_name} ${r.last_name}`} />
                      )}
                      <form action={toggleResidentActiveAction}>
                        <input type="hidden" name="resident_id" value={r.id} />
                        <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                        <button className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700">
                          {r.active ? "Desactivar" : "Reactivar"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(!residents || residents.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  {sp.kind ? "No hay personas en esta categoría." : "Aún no hay residentes cargados."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`text-xs px-3 py-1.5 rounded-full border ${
        active
          ? "bg-emerald-600 border-emerald-500 text-white"
          : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}
