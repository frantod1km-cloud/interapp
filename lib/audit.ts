import { createAdminClient } from "@/lib/supabase/admin";

// Helper para escribir en audit_log. Siempre usamos service_role para que
// el insert no falle por RLS (la tabla solo tiene policy de SELECT para
// admins de la org).
//
// Uso típico:
//   await logAudit({ orgId, userId, action: "resident.invite",
//     entityType: "resident", entityId: r.id, metadata: { email } });
//
// No tiramos errores hacia arriba: si falla el log, no rompemos la acción.

export type AuditAction =
  | "org.create"
  | "org.suspend"
  | "org.reactivate"
  | "resident.create"
  | "resident.invite"
  | "resident.deactivate"
  | "resident.reactivate"
  | "guard.create"
  | "guard.remove"
  | "vehicle.create"
  | "vehicle.remove"
  | "package.create"
  | "package.deliver"
  | "package.return"
  | "authorization.create"
  | "authorization.revoke"
  | "access_event.forced"
  | "subscription.status_change";

export async function logAudit(input: {
  orgId: string | null;
  userId: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      organization_id: input.orgId,
      user_id: input.userId,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
