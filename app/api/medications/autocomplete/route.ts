import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

// GET /api/medications/autocomplete?search=amox
export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  try {
    await connectDB();
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';

    // Build query for tenant
    const match: any = {};
    if (tenantId) {
      match.tenantId = new Types.ObjectId(tenantId);
    }
    if (search) {
      match['treatmentPlan.medications.name'] = { $regex: search, $options: 'i' };
    }

    // Aggregate unique medication names from visits
    const pipeline: any[] = [
      { $match: match },
      { $unwind: '$treatmentPlan.medications' },
      { $group: { _id: null, names: { $addToSet: '$treatmentPlan.medications.name' } } },
      { $project: { _id: 0, names: 1 } },
    ];
    const result = await Visit.aggregate(pipeline);
    const names = result[0]?.names?.filter(Boolean) || [];
    // Optionally, sort and limit
    names.sort((a: string, b: string) => a.localeCompare(b));
    const limited = names.slice(0, 20);
    return NextResponse.json({ success: true, data: limited });
  } catch (error: any) {
    console.error('Error fetching medication names:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch medication names' }, { status: 500 });
  }
}
