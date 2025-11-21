import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const tier = searchParams.get('tier');
    const status = searchParams.get('status');

    let query: any = {};
    if (patientId) {
      query.patient = patientId;
    }
    if (tier) {
      query.tier = tier;
    }
    if (status) {
      query.status = status;
    }

    const memberships = await Membership.find(query)
      .populate('patient', 'firstName lastName patientCode')
      .populate('referredBy', 'firstName lastName patientCode')
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
    const body = await request.json();
    const { patientId, tier, referredBy } = body;

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID required' },
        { status: 400 }
      );
    }

    // Check if patient already has membership
    const existing = await Membership.findOne({ patient: patientId });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Patient already has a membership' },
        { status: 409 }
      );
    }

    const membership = await Membership.create({
      patient: patientId,
      tier: tier || 'bronze',
      referredBy: referredBy || undefined,
    });

    // Update referring patient's referrals list if applicable
    if (referredBy) {
      const referringMembership = await Membership.findOne({ patient: referredBy });
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

    await membership.populate('patient', 'firstName lastName patientCode');
    await membership.populate('referredBy', 'firstName lastName patientCode');

    // Log membership creation
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      action: 'create',
      resource: 'membership',
      resourceId: membership._id,
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

