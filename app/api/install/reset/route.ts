import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runAsSystem } from '@/lib/tenant-context';

/**
 * Reset database - Delete all data
 * WARNING: This will delete all data in the database
 *
 * Gated by middleware.ts (INSTALL_SECRET check in production) — not touched
 * here, only the DB layer below.
 *
 * Migrated off Mongoose: deletes are now Prisma `deleteMany()` calls against
 * Postgres, run sequentially (not in parallel like the old `Promise.all`)
 * because Postgres enforces real foreign-key constraints — deleting a
 * parent row before its children would raise on Mongo happily but the
 * PG FKs will reject it. The order below is unchanged from the original
 * (dependents first, base models last); child/subtable rows (e.g.
 * VisitDiagnosis, PatientAllergy, DoctorScheduleSlot, ...) are not deleted
 * explicitly — every such table has `onDelete: Cascade` back to its parent
 * in prisma/schema.prisma, so they're removed automatically when the
 * parent row above them in this list is deleted.
 */
export async function POST() {
  try {
    // Lightweight connectivity check (replaces mongoose.connection.readyState).
    await prisma.$queryRaw`SELECT 1`;

    const deletionResults: { [key: string]: number } = {};

    try {
      await runAsSystem(async () => {
        // Delete in order: dependent models first, then base models.
        const steps: [string, () => Promise<{ count: number }>][] = [
          // Audit & Notifications
          ['auditlogs', () => prisma.auditLog.deleteMany({})],
          ['notifications', () => prisma.notification.deleteMany({})],
          // Queue & Membership
          ['queues', () => prisma.queue.deleteMany({})],
          ['memberships', () => prisma.membership.deleteMany({})],
          // Documents & Referrals
          ['referrals', () => prisma.referral.deleteMany({})],
          ['documents', () => prisma.document.deleteMany({})],
          // Billing
          ['invoices', () => prisma.invoice.deleteMany({})],
          // Clinical records
          ['procedures', () => prisma.procedure.deleteMany({})],
          ['imaging', () => prisma.imaging.deleteMany({})],
          ['labresults', () => prisma.labResult.deleteMany({})],
          ['prescriptions', () => prisma.prescription.deleteMany({})],
          ['visits', () => prisma.visit.deleteMany({})],
          ['appointments', () => prisma.appointment.deleteMany({})],
          // Inventory & Catalog
          ['inventoryitems', () => prisma.inventoryItem.deleteMany({})],
          ['medicines', () => prisma.medicine.deleteMany({})],
          ['services', () => prisma.service.deleteMany({})],
          ['rooms', () => prisma.room.deleteMany({})],
          // Patient
          ['patients', () => prisma.patient.deleteMany({})],
          // Profile models
          ['medicalrepresentatives', () => prisma.medicalRepresentative.deleteMany({})],
          ['accountants', () => prisma.accountant.deleteMany({})],
          ['receptionists', () => prisma.receptionist.deleteMany({})],
          ['nurses', () => prisma.nurse.deleteMany({})],
          ['doctors', () => prisma.doctor.deleteMany({})],
          ['admins', () => prisma.admin.deleteMany({})],
          ['staff', () => prisma.staff.deleteMany({})],
          // Auth (delete users last since profiles reference them)
          ['users', () => prisma.user.deleteMany({})],
          ['permissions', () => prisma.permission.deleteMany({})],
          ['roles', () => prisma.role.deleteMany({})],
          // Settings (optional - might want to keep)
          ['settings', () => prisma.settings.deleteMany({})],
        ];

        for (const [key, fn] of steps) {
          const result = await fn();
          deletionResults[key] = result.count;
        }
      });

      const totalDeleted = Object.values(deletionResults).reduce((sum, count) => sum + count, 0);

      return NextResponse.json({
        success: true,
        message: 'Database reset successfully',
        results: deletionResults,
        totalDeleted,
      });
    } catch (error: any) {
      console.error('Error resetting database:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to reset database',
          partialResults: deletionResults,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to connect to database',
      },
      { status: 500 }
    );
  }
}
