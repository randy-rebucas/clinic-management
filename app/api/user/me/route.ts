import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

export async function GET() {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    const user = await User.findById(session.userId)
      .select('-password')
      .populate('role', 'name displayName')
      .lean() as any;
    
    if (!user || Array.isArray(user)) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Format user data
    const userObj = user as any;
    return NextResponse.json({ 
      success: true, 
      user: {
        ...userObj,
        _id: userObj._id.toString(),
        role: userObj.role?.name || userObj.role || 'user',
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

