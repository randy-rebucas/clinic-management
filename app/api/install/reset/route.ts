import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { safeEqual } from '@/lib/cron-auth';
import mongoose from 'mongoose';
import {
  AuditLog,
  Notification,
  Queue,
  Membership,
  Referral,
  Document,
  Invoice,
  Procedure,
  Imaging,
  LabResult,
  Prescription,
  Visit,
  Appointment,
  InventoryItem,
  Medicine,
  Service,
  Room,
  Patient,
  MedicalRepresentative,
  MedicalTechnologist,
  Accountant,
  Receptionist,
  Nurse,
  Doctor,
  Admin,
  Staff,
  User,
  Permission,
  Role,
  Settings,
} from '@/models';
import Tenant from '@/models/Tenant';

/**
 * Reset database - Delete all collections
 * WARNING: This will delete all data in the database
 *
 * Requires Authorization: Bearer <INSTALL_SECRET> in every environment (also enforced in
 * proxy.ts); without INSTALL_SECRET configured the route is disabled.
 *
 * Once any clinic exists the reset is refused: it deletes every tenant's data, so a leaked
 * secret must not be enough. INSTALL_ALLOW_RESET=true lifts the lock for a deliberate wipe.
 */
export async function POST(request: NextRequest) {
  const installSecret = process.env.INSTALL_SECRET;
  if (!installSecret) {
    return NextResponse.json({ success: false, error: 'Install routes are disabled' }, { status: 403 });
  }
  if (!safeEqual(request.headers.get('authorization') ?? '', `Bearer ${installSecret}`)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();

    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      return NextResponse.json(
        { success: false, error: 'Database not connected' },
        { status: 500 }
      );
    }


    if (process.env.INSTALL_ALLOW_RESET !== 'true' && (await Tenant.exists({}))) {
      return NextResponse.json(
        { success: false, error: 'Reset is locked because clinics already exist. Set INSTALL_ALLOW_RESET=true to wipe on purpose.' },
        { status: 409 }
      );
    }

    // Delete all collections in the correct order (respecting dependencies)
    const deletionResults: { [key: string]: number } = {};

    try {
      // Delete in order: dependent models first, then base models
      const deletions = await Promise.all([
        // Audit & Notifications
        AuditLog.deleteMany({}).then(result => { deletionResults['auditlogs'] = result.deletedCount; }),
        Notification.deleteMany({}).then(result => { deletionResults['notifications'] = result.deletedCount; }),
        // Queue & Membership
        Queue.deleteMany({}).then(result => { deletionResults['queues'] = result.deletedCount; }),
        Membership.deleteMany({}).then(result => { deletionResults['memberships'] = result.deletedCount; }),
        // Documents & Referrals
        Referral.deleteMany({}).then(result => { deletionResults['referrals'] = result.deletedCount; }),
        Document.deleteMany({}).then(result => { deletionResults['documents'] = result.deletedCount; }),
        // Billing
        Invoice.deleteMany({}).then(result => { deletionResults['invoices'] = result.deletedCount; }),
        // Clinical records
        Procedure.deleteMany({}).then(result => { deletionResults['procedures'] = result.deletedCount; }),
        Imaging.deleteMany({}).then(result => { deletionResults['imaging'] = result.deletedCount; }),
        LabResult.deleteMany({}).then(result => { deletionResults['labresults'] = result.deletedCount; }),
        Prescription.deleteMany({}).then(result => { deletionResults['prescriptions'] = result.deletedCount; }),
        Visit.deleteMany({}).then(result => { deletionResults['visits'] = result.deletedCount; }),
        Appointment.deleteMany({}).then(result => { deletionResults['appointments'] = result.deletedCount; }),
        // Inventory & Catalog
        InventoryItem.deleteMany({}).then(result => { deletionResults['inventoryitems'] = result.deletedCount; }),
        Medicine.deleteMany({}).then(result => { deletionResults['medicines'] = result.deletedCount; }),
        Service.deleteMany({}).then(result => { deletionResults['services'] = result.deletedCount; }),
        Room.deleteMany({}).then(result => { deletionResults['rooms'] = result.deletedCount; }),
        // Patient
        Patient.deleteMany({}).then(result => { deletionResults['patients'] = result.deletedCount; }),
        // Profile models (these have post-save hooks that create Users)
        MedicalRepresentative.deleteMany({}).then(result => { deletionResults['medicalrepresentatives'] = result.deletedCount; }),
        Accountant.deleteMany({}).then(result => { deletionResults['accountants'] = result.deletedCount; }),
        MedicalTechnologist.deleteMany({}).then(result => { deletionResults['medicaltechnologists'] = result.deletedCount; }),
        Receptionist.deleteMany({}).then(result => { deletionResults['receptionists'] = result.deletedCount; }),
        Nurse.deleteMany({}).then(result => { deletionResults['nurses'] = result.deletedCount; }),
        Doctor.deleteMany({}).then(result => { deletionResults['doctors'] = result.deletedCount; }),
        Admin.deleteMany({}).then(result => { deletionResults['admins'] = result.deletedCount; }),
        Staff.deleteMany({}).then(result => { deletionResults['staff'] = result.deletedCount; }),
        // Auth (delete users last since profiles reference them)
        User.deleteMany({}).then(result => { deletionResults['users'] = result.deletedCount; }),
        Permission.deleteMany({}).then(result => { deletionResults['permissions'] = result.deletedCount; }),
        Role.deleteMany({}).then(result => { deletionResults['roles'] = result.deletedCount; }),
        // Settings (optional - might want to keep)
        Settings.deleteMany({}).then(result => { deletionResults['settings'] = result.deletedCount; }),
      ]);

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
          error: 'Failed to reset database',
          partialResults: deletionResults,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Install reset failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to connect to database',
      },
      { status: 500 }
    );
  }
}

