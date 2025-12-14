import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read invoices
  const permissionCheck = await requirePermission(session, 'invoices', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const visitId = searchParams.get('visitId');
    const status = searchParams.get('status');

    let query: any = {};
    
    // Add tenant filter
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    if (patientId) {
      query.patient = patientId;
    }
    if (visitId) {
      query.visit = visitId;
    }
    if (status) {
      query.status = status;
    }

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode email phone',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    const invoices = await Invoice.find(query)
      .populate(patientPopulateOptions)
      .populate('visit', 'visitCode date')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: invoices });
  } catch (error: any) {
    // Improved error logging and reporting
    console.error('Error fetching invoices:', error);
    let errorMessage = 'Failed to fetch invoices';
    if (error && error.message) {
      errorMessage += `: ${error.message}`;
    }
    return NextResponse.json(
      { success: false, error: errorMessage, details: error?.stack || error },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to write/create invoices
  const permissionCheck = await requirePermission(session, 'invoices', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Validate that the patient belongs to the tenant
    if (body.patient && tenantId) {
      const patientQuery: any = {
        _id: body.patient,
        tenantId: new Types.ObjectId(tenantId),
      };
      const patient = await Patient.findOne(patientQuery);
      if (!patient) {
        return NextResponse.json(
          { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
          { status: 400 }
        );
      }
    }

    // Auto-generate invoice number using settings prefix (tenant-scoped)
    const settings = await getSettings();
    const invoicePrefix = settings.billingSettings?.invoicePrefix || 'INV';
    
    const codeQuery: any = { invoiceNumber: { $exists: true, $ne: null } };
    if (tenantId) {
      codeQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const lastInvoice = await Invoice.findOne(codeQuery)
      .sort({ invoiceNumber: -1 })
      .exec();

    let nextNumber = 1;
    if (lastInvoice?.invoiceNumber) {
      // Extract number from invoice number (handles any prefix)
      const match = lastInvoice.invoiceNumber.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    body.invoiceNumber = `${invoicePrefix}-${String(nextNumber).padStart(6, '0')}`;

    // Calculate totals
    const subtotal = body.items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
    const discountTotal = body.discounts?.reduce((sum: number, disc: any) => sum + (disc.amount || 0), 0) || 0;
    const afterDiscount = subtotal - discountTotal;
    const tax = body.tax || 0;
    const total = afterDiscount + tax;

    body.subtotal = subtotal;
    body.total = total;
    body.outstandingBalance = total;
    body.totalPaid = 0;
    body.status = 'unpaid';

    // Set createdBy
    if (!body.createdBy) {
      body.createdBy = session.userId;
    }

    // Ensure invoice is created with tenantId
    const invoiceData: any = { ...body };
    if (tenantId && !invoiceData.tenantId) {
      invoiceData.tenantId = new Types.ObjectId(tenantId);
    }

    const invoice = await Invoice.create(invoiceData);
    
    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode email phone',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    await invoice.populate(patientPopulateOptions);
    await invoice.populate('visit', 'visitCode date');
    await invoice.populate('createdBy', 'name email');

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create invoice' },
      { status: 500 }
    );
  }
}

