import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { logDataExport } from '@/lib/audit';
import { Types } from 'mongoose';

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
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const body = await request.json();
    const { patientIds = [], format = 'csv', columns } = body;

    if (!Array.isArray(patientIds) || patientIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'patientIds must be a non-empty array' },
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
    const validIds = patientIds.filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length !== patientIds.length) {
      return NextResponse.json(
        { success: false, error: 'Some patient IDs are invalid' },
        { status: 400 }
      );
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Build query
    const query: any = { _id: { $in: validIds.map((id) => new Types.ObjectId(id)) } };
    if (tenantId) {
      query.tenantIds = tenantId;
    }

    const patients = await Patient.find(query).lean();

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

    // Handle arrays and objects
    if (Array.isArray(value)) {
      return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v)).join('; ');
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    return value === null || value === undefined ? '' : String(value);
  };

  // CSV escape function
  const escapeCSV = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
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
