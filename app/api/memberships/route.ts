import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;
    
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const tier = searchParams.get('tier');
    const status = searchParams.get('status');

    const query: any = {};
    
    // Add tenant filter
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    if (patientId) {
      query.patient = patientId;
    }
    if (tier) {
      query.tier = tier;
    }
    if (status) {
      query.status = status;
    }

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const referredByPopulateOptions: any = {
      path: 'referredBy',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      referredByPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      referredByPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    const memberships = await Membership.find(query)
      .populate(patientPopulateOptions)
      .populate(referredByPopulateOptions)
      .sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: memberships });
  } catch (error: any) {
    console.error('Error fetching memberships:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch memberships' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;
    
    const body = await request.json();
    const { patientId, tier, referredBy } = body;

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID required' },
        { status: 400 }
      );
    }

    // Validate that the patient belongs to the tenant
    const patientQuery: any = { _id: patientId };
    if (tenantId) {
      patientQuery.tenantIds = new Types.ObjectId(tenantId);
    } else {
      patientQuery.$or = [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }];
    }
    
    const patient = await Patient.findOne(patientQuery);
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Check if patient already has membership (tenant-scoped)
    const existingQuery: any = { patient: patientId };
    if (tenantId) {
      existingQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      existingQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const existing = await Membership.findOne(existingQuery);
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Patient already has a membership' },
        { status: 409 }
      );
    }

    const membershipData: any = {
      patient: patientId,
      tier: tier || 'bronze',
      referredBy: referredBy || undefined,
    };
    
    if (tenantId) {
      membershipData.tenantId = new Types.ObjectId(tenantId);
    }

    const membership = await Membership.create(membershipData);

    // Update referring patient's referrals list if applicable (tenant-scoped)
    if (referredBy) {
      const referringQuery: any = { patient: referredBy };
      if (tenantId) {
        referringQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        referringQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const referringMembership = await Membership.findOne(referringQuery);
      if (referringMembership) {
        referringMembership.referrals.push(patientId);
        referringMembership.transactions.push({
          type: 'earn',
          points: 100,
          description: 'Referral bonus',
          createdAt: new Date(),
        });
        referringMembership.points += 100;
        referringMembership.totalPointsEarned += 100;
        await referringMembership.save();
      }
      
      // Award points to new member
      membership.points += 100;
      membership.totalPointsEarned += 100;
      membership.transactions.push({
        type: 'earn',
        points: 100,
        description: 'Welcome bonus (referred)',
        createdAt: new Date(),
      });
      await membership.save();
    }

    // Populate with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }] };
    }
    
    const referredByPopulateOptions: any = {
      path: 'referredBy',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      referredByPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      referredByPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    await membership.populate(patientPopulateOptions);
    await membership.populate(referredByPopulateOptions);

    // Log membership creation
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: tenantId,
      action: 'create',
      resource: 'patient',
      resourceId: membership.patient,
      description: `Created membership for patient ${patientId}`,
    });

    return NextResponse.json({ success: true, data: membership }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating membership:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create membership' },
      { status: 500 }
    );
  }
}

