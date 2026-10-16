import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, patientTenantFilter } from '@/lib/api/tenant-session';
import { logDataExport } from '@/lib/audit';
import { Types } from 'mongoose';

const MAX_EXPORT = 1000;

const SENSITIVE_FIELDS_PROJECTION =
  '-password -otp -otpExpiry -otpAttempts -sessionVersion -loginQrTokenHash -loginQrTokenExpiry -readNotificationIds -attachments';

const EXPORTABLE_COLUMNS = new Set([
  'patientCode', 'firstName', 'middleName', 'lastName', 'suffix', 'dateOfBirth', 'sex', 'civilStatus',
  'nationality', 'occupation', 'email', 'phone', 'address.street', 'address.city', 'address.state',
  'address.zipCode', 'emergencyContact.name', 'emergencyContact.phone', 'emergencyContact.relationship',
  'identifiers.philHealth', 'identifiers.govId', 'nationalId', 'philHealth', 'medicalHistory', 'allergies',
  'preExistingConditions', 'active', 'tags', 'createdAt', 'updatedAt',
]);

/**
 * POST /api/patients/export
 *
 * Bulk export patient data to CSV or JSON format.
 *
 * Request body:
 * {
 *   patientIds: string[],
 *   format: 'csv' | 'json', // default: 'csv'
 *   columns?: string[] // specific columns to include (default: all)
 * }
 *
 * Returns:
 * - format=csv: CSV file download
 * - format=json: JSON array
 *
 * Requires staff authentication + patients:read permission.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const body = await request.json().catch(() => null);
    const { patientIds = [], format = 'csv' } = body ?? {};
    const columns: string[] | undefined = Array.isArray(body?.columns)
      ? body.columns.filter((c: unknown): c is string => typeof c === 'string' && EXPORTABLE_COLUMNS.has(c))
      : undefined;

    if (!Array.isArray(patientIds) || patientIds.length === 0 || patientIds.length > MAX_EXPORT) {
      return NextResponse.json(
        { success: false, error: `patientIds must be a non-empty array of at most ${MAX_EXPORT} ids` },
        { status: 400 }
      );
    }

    if (!['csv', 'json'].includes(format)) {
      return NextResponse.json(
        { success: false, error: 'format must be csv or json' },
        { status: 400 }
      );
    }

    // Validate patient IDs
    const validIds = patientIds.filter((id: unknown): id is string => isValidId(id));
    if (validIds.length !== patientIds.length) {
      return NextResponse.json(
        { success: false, error: 'Some patient IDs are invalid' },
        { status: 400 }
      );
    }

    const patients = await Patient.find(
      patientTenantFilter(tenantId, { _id: { $in: validIds.map((id) => new Types.ObjectId(id)) } })
    )
      .select(SENSITIVE_FIELDS_PROJECTION)
      .lean();

    if (patients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No patients found' },
        { status: 404 }
      );
    }

    // Audit log
    await logDataExport(
      session.userId,
      session.email,
      session.role,
      'patient',
      `bulk_export_${patients.length}`,
      request.headers.get('x-forwarded-for') ?? undefined,
      {
        exportType: format,
        patientCount: patients.length,
        columnCount: columns?.length ?? 'all',
      }
    );

    if (format === 'json') {
      return NextResponse.json(
        {
          success: true,
          data: patients,
          count: patients.length,
          exportDate: new Date().toISOString(),
        },
        {
          headers: {
            'Content-Disposition': `attachment; filename="patients-export-${new Date().toISOString().split('T')[0]}.json"`,
          },
        }
      );
    }

    // CSV Export
    const csvData = convertToCSV(patients, columns);

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': `attachment; filename="patients-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting patients:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to export patients' },
      { status: 500 }
    );
  }
}

/**
 * Convert patients array to CSV format
 */
function convertToCSV(patients: any[], columns?: string[]): string {
  if (patients.length === 0) return '';

  // Default columns if not specified
  const defaultColumns = [
    'patientCode',
    'firstName',
    'middleName',
    'lastName',
    'dateOfBirth',
    'sex',
    'email',
    'phone',
    'address.street',
    'address.city',
    'address.state',
    'address.zipCode',
    'nationalId',
    'philHealth',
  ];

  const cols = columns && columns.length > 0 ? columns : defaultColumns;

  // Helper to get nested value
  const getValue = (obj: any, path: string): string => {
    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      value = value?.[part];
    }

    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    if (Array.isArray(value)) {
      return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v)).join('; ');
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return value === null || value === undefined ? '' : String(value);
  };

  // CSV escape function
  const escapeCSV = (raw: string): string => {
    // Neutralise spreadsheet formulas (CSV injection).
    const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  // Build CSV header
  const header = cols.map((col) => escapeCSV(col)).join(',');

  // Build CSV rows
  const rows = patients.map((patient) =>
    cols.map((col) => escapeCSV(getValue(patient, col))).join(',')
  );

  return [header, ...rows].join('\n');
}
