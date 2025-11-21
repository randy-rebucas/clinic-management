import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    const { points, description, type, relatedEntity } = body;

    if (!points || !description) {
      return NextResponse.json(
        { success: false, error: 'Points and description required' },
        { status: 400 }
      );
    }

    const membership = await Membership.findById(id);
    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'Membership not found' },
        { status: 404 }
      );
    }

    const transactionType = type || (points > 0 ? 'earn' : 'redeem');

    if (transactionType === 'earn') {
      membership.points += points;
      membership.totalPointsEarned += points;
    } else if (transactionType === 'redeem') {
      if (membership.points < points) {
        return NextResponse.json(
          { success: false, error: 'Insufficient points' },
          { status: 400 }
        );
      }
      membership.points -= points;
      membership.totalPointsRedeemed += points;
    }

    membership.transactions.push({
      type: transactionType,
      points: Math.abs(points),
      description,
      relatedEntity: relatedEntity || undefined,
      createdAt: new Date(),
    });

    await membership.save();

    return NextResponse.json({ success: true, data: membership });
  } catch (error: any) {
    console.error('Error updating points:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update points' },
      { status: 500 }
    );
  }
}

