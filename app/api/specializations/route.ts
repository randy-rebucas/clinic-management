import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Specialization from '@/models/Specialization';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

/**
 * GET /api/specializations
 * 
 * Fetch all active medical specializations.
 * Specializations are global and shared across all tenants.
 * 
 * Query Parameters:
 * - category: Filter by category (optional)
 * - search: Search by name (optional)
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    // Build query - specializations are global (not tenant-scoped)
    const query: any = { active: true };
    
    if (category) {
      query.category = category;
    }
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const specializations = await Specialization.find(query)
      .select('_id name description category active')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ 
      success: true, 
      data: specializations,
      count: specializations.length 
    });
  } catch (error: any) {
    console.error('Error fetching specializations:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch specializations' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/specializations
 * 
 * Create a new specialization.
 * Requires admin privileges.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check if user is admin
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Only admins can create specializations' },
      { status: 403 }
    );
  }

  try {
    await connectDB();

    const body = await request.json();
    const { name, description, category, active = true } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Specialization name is required' },
        { status: 400 }
      );
    }

    // Check if specialization already exists (global check)
    const existing = await Specialization.findOne({ name: name.trim() });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Specialization already exists' },
        { status: 400 }
      );
    }

    const specialization = await Specialization.create({
      name: name.trim(),
      description: description?.trim(),
      category: category?.trim(),
      active,
    });

    return NextResponse.json(
      { success: true, data: specialization },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating specialization:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create specialization' },
      { status: 500 }
    );
  }
}
