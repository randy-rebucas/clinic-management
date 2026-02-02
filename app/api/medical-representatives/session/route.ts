import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { cookies } from 'next/headers';

/**
 * GET /api/medical-representatives/session
 * Get current medical representative session data
 */
export async function GET(request: NextRequest) {
  try {
    // Verify session
    const session = await verifySession();
    console.log('Medical rep session verification:', session);
    
    if (!session) {
      console.log('No session found');
      return NextResponse.json(
        { success: false, error: 'Unauthorized - No session found' },
        { status: 401 }
      );
    }

    // Check if user is a medical representative
    if (session.role !== 'medical-representative') {
      console.log('Invalid role:', session.role);
      return NextResponse.json(
        { success: false, error: 'Forbidden - Medical representative access only' },
        { status: 403 }
      );
    }

    await connectDB();

    // Find medical representative by user ID
    const medicalRep = await MedicalRepresentative.findOne({ 
      userId: session.userId 
    }).lean();

    if (!medicalRep) {
      return NextResponse.json(
        { success: false, error: 'Medical representative not found' },
        { status: 404 }
      );
    }

    // Return medical representative data (TypeScript safe)
    return NextResponse.json({
      success: true,
      data: medicalRep,
    });
  } catch (error: any) {
    console.error('Get medical representative session error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/medical-representatives/session
 * Logout medical representative (delete session)
 */
export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    
    // Delete the session cookie
    cookieStore.delete('session');

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
