import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read referrals
  const permissionCheck = await requirePermission(session, 'referrals', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;
    
    const searchParams = request.nextUrl.searchParams;
    const referringDoctor = searchParams.get('referringDoctor');
    const receivingDoctor = searchParams.get('receivingDoctor');
    const patientId = searchParams.get('patientId');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    const query: any = {};
    
    // Add tenant filter
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    if (referringDoctor) {
      query.referringDoctor = referringDoctor;
    }
    if (receivingDoctor) {
      query.receivingDoctor = receivingDoctor;
    }
    if (patientId) {
      query.patient = patientId;
    }
    if (status) {
      query.status = status;
    }
    if (type) {
      query.type = type;
    }

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }] };
    }
    
    const doctorPopulateOptions: any = {
      path: 'referringDoctor',
      select: 'firstName lastName specializationId',
      populate: {
        path: 'specializationId',
        select: 'name',
      },
    };
    if (tenantId) {
      doctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      doctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const receivingDoctorPopulateOptions: any = {
      path: 'receivingDoctor',
      select: 'firstName lastName specializationId',
      populate: {
        path: 'specializationId',
        select: 'name',
      },
    };
    if (tenantId) {
      receivingDoctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      receivingDoctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    const referrals = await Referral.find(query)
      .populate(doctorPopulateOptions)
      .populate(receivingDoctorPopulateOptions)
      .populate(patientPopulateOptions)
      .populate('visit', 'visitCode date')
      .populate('appointment', 'appointmentCode appointmentDate')
      .sort({ referredDate: -1 });

    return NextResponse.json({ success: true, data: referrals });
  } catch (error: any) {
    console.error('Error fetching referrals:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch referrals' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to write/create referrals
  const permissionCheck = await requirePermission(session, 'referrals', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;
    
    // Validate that the patient belongs to the tenant
    // Patient model uses tenantIds (array) since patients can belong to multiple clinics
    if (body.patient && tenantId) {
      const patientQuery: any = {
        _id: body.patient,
        tenantIds: new Types.ObjectId(tenantId),
      };
      const patient = await Patient.findOne(patientQuery);
      if (!patient) {
        return NextResponse.json(
          { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
          { status: 400 }
        );
      }
    }
    
    // Validate that doctors belong to the tenant
    if (body.referringDoctor && tenantId) {
      const doctorQuery: any = {
        _id: body.referringDoctor,
        tenantId: new Types.ObjectId(tenantId),
      };
      const doctor = await Doctor.findOne(doctorQuery);
      if (!doctor) {
        return NextResponse.json(
          { success: false, error: 'Invalid referring doctor selected. Please select a doctor from this clinic.' },
          { status: 400 }
        );
      }
    }
    
    if (body.receivingDoctor && tenantId) {
      const doctorQuery: any = {
        _id: body.receivingDoctor,
        tenantId: new Types.ObjectId(tenantId),
      };
      const doctor = await Doctor.findOne(doctorQuery);
      if (!doctor) {
        return NextResponse.json(
          { success: false, error: 'Invalid receiving doctor selected. Please select a doctor from this clinic.' },
          { status: 400 }
        );
      }
    }
    
    // Debug: log the incoming body to see what's being sent

    // Generate referral code if not provided (tenant-scoped)
    let referralCode = body.referralCode;
    if (!referralCode) {
      const countQuery: any = {};
      if (tenantId) {
        countQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        countQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      const count = await Referral.countDocuments(countQuery);
      referralCode = `REF-${Date.now()}-${count + 1}`;
    }

    // Clean up referringContact - only include if it has a name
    const cleanedBody = { ...body };
    
    // Remove referringContact entirely if it's empty, null, undefined, or doesn't have a name
    if (cleanedBody.referringContact) {
      const name = cleanedBody.referringContact.name;
      if (!name || (typeof name === 'string' && name.trim() === '')) {
        delete cleanedBody.referringContact;
      } else {
        // Clean up empty phone/email fields
        if (!cleanedBody.referringContact.phone || cleanedBody.referringContact.phone.trim() === '') {
          delete cleanedBody.referringContact.phone;
        }
        if (!cleanedBody.referringContact.email || cleanedBody.referringContact.email.trim() === '') {
          delete cleanedBody.referringContact.email;
        }
      }
    }
    
    // Ensure referringContact is completely removed if it's an empty object
    if (cleanedBody.referringContact && Object.keys(cleanedBody.referringContact).length === 0) {
      delete cleanedBody.referringContact;
    }

    // Ensure referral is created with tenantId
    const referralData: any = {
      ...cleanedBody,
      referralCode,
      referredDate: cleanedBody.referredDate || new Date(),
    };
    if (tenantId && !referralData.tenantId) {
      referralData.tenantId = new Types.ObjectId(tenantId);
    }

    const referral = await Referral.create(referralData);
    
    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }] };
    }
    
    const doctorPopulateOptions: any = {
      path: 'referringDoctor',
      select: 'firstName lastName specializationId',
      populate: {
        path: 'specializationId',
        select: 'name',
      },
    };
    if (tenantId) {
      doctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      doctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const receivingDoctorPopulateOptions: any = {
      path: 'receivingDoctor',
      select: 'firstName lastName specializationId',
      populate: {
        path: 'specializationId',
        select: 'name',
      },
    };
    if (tenantId) {
      receivingDoctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      receivingDoctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    await referral.populate(doctorPopulateOptions);
    await referral.populate(receivingDoctorPopulateOptions);
    await referral.populate(patientPopulateOptions);

    // Log referral creation
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: tenantId,
      action: 'create',
      resource: 'patient',
      resourceId: referral._id,
      description: `Created ${referral.type} referral for patient ${referral.patient}`,
    });

    return NextResponse.json({ success: true, data: referral }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating referral:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create referral' },
      { status: 500 }
    );
  }
}

