import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';

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
    const searchParams = request.nextUrl.searchParams;
    const referringDoctor = searchParams.get('referringDoctor');
    const receivingDoctor = searchParams.get('receivingDoctor');
    const patientId = searchParams.get('patientId');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    let query: any = {};
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

    const referrals = await Referral.find(query)
      .populate('referringDoctor', 'firstName lastName specialization')
      .populate('receivingDoctor', 'firstName lastName specialization')
      .populate('patient', 'firstName lastName patientCode')
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
    
    // Debug: log the incoming body to see what's being sent
    console.log('Incoming referral data:', JSON.stringify(body, null, 2));

    // Generate referral code if not provided
    let referralCode = body.referralCode;
    if (!referralCode) {
      const count = await Referral.countDocuments();
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

    const referral = await Referral.create({
      ...cleanedBody,
      referralCode,
      referredDate: cleanedBody.referredDate || new Date(),
    });

    await referral.populate('referringDoctor', 'firstName lastName specialization');
    await referral.populate('receivingDoctor', 'firstName lastName specialization');
    await referral.populate('patient', 'firstName lastName patientCode');

    // Log referral creation
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
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

