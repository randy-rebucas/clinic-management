import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { listAppointments } from '@/lib/data/appointment';
import { listVisits } from '@/lib/data/visit';
import { listPrescriptions } from '@/lib/data/prescription';
import { listLabResults } from '@/lib/data/lab-result';
import { listInvoices } from '@/lib/data/invoice';
import { listDocuments } from '@/lib/data/document';
import { listReferrals } from '@/lib/data/referral';
import type { Prisma } from '@prisma/client';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * Get patient session data
 * Returns patient profile and related data based on patient session cookie
 */
export async function GET(request: NextRequest) {
  try {
    const sessionData = await verifyPatientAuth(request);

    if (!sessionData) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login.' },
        { status: 401 }
      );
    }

    // Get patient data
    const patient = await runAsSystem(() => getPatientById(sessionData.patientId));

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found.' },
        { status: 404 }
      );
    }

    if ((patient as any).active === false) {
      return NextResponse.json(
        { success: false, error: 'Patient account is inactive. Please contact the clinic.' },
        { status: 403 }
      );
    }

    // Get query params for optional data loading
    const searchParams = request.nextUrl.searchParams;
    const include = searchParams.get('include')?.split(',') || [];

    const responseData: any = {
      patient: {
        _id: (patient as any)._id,
        patientCode: (patient as any).patientCode,
        firstName: (patient as any).firstName,
        middleName: (patient as any).middleName,
        lastName: (patient as any).lastName,
        suffix: (patient as any).suffix,
        dateOfBirth: (patient as any).dateOfBirth,
        sex: (patient as any).sex,
        email: (patient as any).email,
        phone: (patient as any).phone,
        address: (patient as any).address,
        emergencyContact: (patient as any).emergencyContact,
        allergies: (patient as any).allergies,
        medicalHistory: (patient as any).medicalHistory,
        preExistingConditions: (patient as any).preExistingConditions,
        discountEligibility: (patient as any).discountEligibility,
      },
    };

    // Get tenantId from patient (Patient schema uses tenantIds array)
    const patientTenantId: string | undefined = (patient as any).tenantIds?.[0];

    // Optionally load related data (tenant-scoped)
    if (include.includes('appointments') || include.includes('all')) {
      const where: Prisma.AppointmentWhereInput = { patientId: (patient as any)._id };
      const appointments = await run(patientTenantId, () => listAppointments(where));
      responseData.appointments = appointments
        .sort((a: any, b: any) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime())
        .slice(0, 10);
    }

    if (include.includes('visits') || include.includes('all')) {
      const where: Prisma.VisitWhereInput = { patientId: (patient as any)._id };
      const visits = await run(patientTenantId, () => listVisits(where, 10));
      responseData.visits = visits;
    }

    if (include.includes('prescriptions') || include.includes('all')) {
      const where: Prisma.PrescriptionWhereInput = { patientId: (patient as any)._id };
      const prescriptions = await run(patientTenantId, () => listPrescriptions(where));
      responseData.prescriptions = prescriptions
        .sort((a: any, b: any) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
        .slice(0, 10);
    }

    if (include.includes('labResults') || include.includes('all')) {
      const where: Prisma.LabResultWhereInput = { patientId: (patient as any)._id };
      const labResults = await run(patientTenantId, () => listLabResults(where));
      responseData.labResults = labResults
        .sort((a: any, b: any) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
        .slice(0, 10);
    }

    if (include.includes('invoices') || include.includes('all')) {
      const where: Prisma.InvoiceWhereInput = { patientId: (patient as any)._id };
      const invoices = await run(patientTenantId, () => listInvoices(where));
      responseData.invoices = invoices.slice(0, 10);
    }

    if (include.includes('documents') || include.includes('all')) {
      const where: Prisma.DocumentWhereInput = {
        patientId: (patient as any)._id,
        status: 'active',
        isConfidential: { not: true }, // Don't show confidential documents
      };
      const { items: documents } = await run(patientTenantId, () => listDocuments(where, 20));
      responseData.documents = documents.map((d: any) => ({
        _id: d._id,
        documentCode: d.documentCode,
        title: d.title,
        description: d.description,
        category: d.category,
        documentType: d.documentType,
        filename: d.filename,
        size: d.size,
        uploadDate: d.uploadDate,
      }));
    }

    if (include.includes('referrals') || include.includes('all')) {
      const where: Prisma.ReferralWhereInput = { patientId: (patient as any)._id };
      const referrals = await run(patientTenantId, () => listReferrals(where));
      responseData.referrals = referrals.slice(0, 10);
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    });

  } catch (error: any) {
    logger.error('Error fetching patient session', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient data' },
      { status: 500 }
    );
  }
}

/**
 * Logout patient - clear session cookie
 */
export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully',
  });

  // Clear the patient session cookie
  response.cookies.set('patient_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });

  return response;
}
