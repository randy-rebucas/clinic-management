import { Prisma } from '@prisma/client';
import { getTenantContext } from './tenant-context';

/**
 * Prisma models that carry a direct `tenantId` column. Scoping = merge
 * `{ tenantId }` into every read/write filter and into create() payloads.
 *
 * Pure child tables (PrescriptionMedication, InvoiceLineItem, etc.) are
 * intentionally NOT listed here: they reach their tenant only through a
 * required relation to one of these parents, and that parent relation is
 * itself tenant-checked whenever it's looked up first. If a route ever
 * queries a child table directly by id without first verifying the parent
 * belongs to the tenant, that is a bug to catch in code review — the
 * extension has no way to scope a table that has no tenant column and no
 * reliable parent join at the query-args level.
 */
const DIRECTLY_SCOPED_MODELS = new Set([
  'Accountant',
  'Admin',
  'Appointment',
  'AuditLog',
  'BackupRecord',
  'Doctor',
  'Document',
  'Imaging',
  'InventoryItem',
  'Invoice',
  'LabResult',
  'MedicalRepresentativeVisit',
  'Medicine',
  'Membership',
  'Notification',
  'Nurse',
  'PatientNote',
  'PaypalOrder',
  'Permission',
  'Prescription',
  'Procedure',
  'Product',
  'PushSubscription',
  'Queue',
  'Receptionist',
  'Referral',
  'Role',
  'Room',
  'Service',
  'Settings',
  'Staff',
  'SupportRequest',
  'SurveyResponse',
  'User',
  'Visit',
]);

/**
 * Models scoped via a many-to-many junction table rather than a direct
 * tenantId column (Patient and MedicalRepresentative can each legitimately
 * belong to more than one tenant — see prisma/MIGRATION_NOTES.md). Scoping
 * = require a matching row in the junction relation instead of an equality
 * filter on tenantId.
 */
const JUNCTION_SCOPED_MODELS: Record<string, string> = {
  Patient: 'tenants',
  MedicalRepresentative: 'tenants',
};

const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

const WRITE_WHERE_OPERATIONS = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert']);

function scopedWhere(model: string, where: Record<string, unknown> | undefined, tenantId: string) {
  if (JUNCTION_SCOPED_MODELS[model]) {
    const relation = JUNCTION_SCOPED_MODELS[model];
    return {
      AND: [where ?? {}, { [relation]: { some: { tenantId } } }],
    };
  }
  return {
    AND: [where ?? {}, { tenantId }],
  };
}

/**
 * Prisma Client Extension that auto-injects tenant scoping on every query
 * against a tenant-scoped model, reading the active tenant from the
 * AsyncLocalStorage context set up in lib/tenant-context.ts. This is the
 * data-access seam the Mongoose-era codebase never had: previously every
 * route added `{ tenantId }` to its own query by hand, with no central
 * enforcement.
 *
 * Escape hatches:
 * - runAsSystem() (tenant-context.ts) — cron/admin operations that must
 *   see across all tenants. Required, not optional: without an active
 *   tenant context, every tenant-scoped call throws rather than silently
 *   returning unscoped data.
 * - Non-tenant-scoped models (Tenant, Specialization, PatientTenant,
 *   MedicalRepresentativeTenant, and pure child tables) pass through
 *   untouched.
 */
export function withTenantScoping() {
  return Prisma.defineExtension({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const isDirectlyScoped = DIRECTLY_SCOPED_MODELS.has(model);
          const isJunctionScoped = Boolean(JUNCTION_SCOPED_MODELS[model]);

          if (!isDirectlyScoped && !isJunctionScoped) {
            return query(args);
          }

          const ctx = getTenantContext();
          if (!ctx) {
            throw new Error(
              `Tenant-scoped query on "${model}.${operation}" ran with no tenant context. ` +
                `Wrap the call in runWithTenant(tenantId, fn) or, for cron/admin code that must ` +
                `cross tenants, runAsSystem(fn). See lib/tenant-context.ts.`
            );
          }

          if (ctx.bypass) {
            return query(args);
          }

          if (!ctx.tenantId) {
            throw new Error(
              `Tenant-scoped query on "${model}.${operation}" ran with an empty tenantId in a ` +
                `non-bypass context. This should be unreachable — runWithTenant() always sets one.`
            );
          }

          const tenantId = ctx.tenantId;
          const typedArgs = args as { where?: Record<string, unknown>; data?: unknown };

          if (READ_OPERATIONS.has(operation) || WRITE_WHERE_OPERATIONS.has(operation)) {
            typedArgs.where = scopedWhere(model, typedArgs.where, tenantId);
          }

          if (operation === 'create' && isDirectlyScoped) {
            typedArgs.data = { ...(typedArgs.data as Record<string, unknown>), tenantId };
          }

          if (operation === 'createMany' && isDirectlyScoped) {
            const data = (args as { data?: unknown }).data;
            (args as { data?: unknown }).data = Array.isArray(data)
              ? data.map((row) => ({ ...(row as Record<string, unknown>), tenantId }))
              : data;
          }

          // Junction-scoped models (Patient, MedicalRepresentative) are
          // intentionally NOT auto-stamped on create — a patient can be
          // created for one or several tenants at once, so the caller must
          // pass its own nested junction-table create (e.g.
          // `patientTenants: { create: { tenantId } }`) rather than have
          // the extension guess.

          return query(typedArgs as typeof args);
        },
      },
    },
  });
}
