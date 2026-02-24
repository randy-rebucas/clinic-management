import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Medicine from '@/models/Medicine';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export interface MedicineSuggestion {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  source: 'catalog' | 'history';
}

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

    const tenantFilter: any = tenantId ? { tenantId: new Types.ObjectId(tenantId) } : {};
    const searchRegex = search ? { $regex: search, $options: 'i' } : undefined;

    // 1. Query Medicine catalog — primary source, returns full suggestion objects
    const medicineFilter: any = { active: true, ...tenantFilter };
    if (search) {
      medicineFilter.$or = [
        { name: searchRegex },
        { genericName: searchRegex },
        { brandNames: searchRegex },
      ];
    }
    const medicines = await Medicine.find(medicineFilter)
      .select('name genericName brandNames standardDosage standardFrequency duration')
      .limit(50)
      .lean();

    // Build catalog suggestions (name entry + generic name entry)
    const catalogMap = new Map<string, MedicineSuggestion>();
    for (const med of medicines) {
      const m = med as any;
      const suggestion: MedicineSuggestion = {
        name: m.name,
        dosage: m.standardDosage || '',
        frequency: m.standardFrequency || '',
        duration: m.duration || '',
        source: 'catalog',
      };
      catalogMap.set(m.name.toLowerCase(), suggestion);

      if (m.genericName && !catalogMap.has(m.genericName.toLowerCase())) {
        catalogMap.set(m.genericName.toLowerCase(), {
          name: m.genericName,
          dosage: m.standardDosage || '',
          frequency: m.standardFrequency || '',
          duration: m.duration || '',
          source: 'catalog',
        });
      }
    }

    // 2. Aggregate unique medication names from past visits (as fallback history)
    const visitMatch: any = { ...tenantFilter };
    if (search) visitMatch['treatmentPlan.medications.name'] = searchRegex;
    const visitPipeline: any[] = [
      { $match: visitMatch },
      { $unwind: '$treatmentPlan.medications' },
      ...(search ? [{ $match: { 'treatmentPlan.medications.name': searchRegex } }] : []),
      { $group: { _id: '$treatmentPlan.medications.name', dosage: { $first: '$treatmentPlan.medications.dosage' }, frequency: { $first: '$treatmentPlan.medications.frequency' }, duration: { $first: '$treatmentPlan.medications.duration' } } },
    ];
    const visitResult = await Visit.aggregate(visitPipeline);
    for (const v of visitResult) {
      if (!v._id) continue;
      const key = v._id.toLowerCase();
      if (!catalogMap.has(key)) {
        catalogMap.set(key, {
          name: v._id,
          dosage: v.dosage || '',
          frequency: v.frequency || '',
          duration: v.duration || '',
          source: 'history',
        });
      }
    }

    // 3. Sort catalog first, then history; alphabetical within each group
    const results = Array.from(catalogMap.values())
      .sort((a, b) => {
        if (a.source !== b.source) return a.source === 'catalog' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 30);

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Error fetching medication names:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch medication names' }, { status: 500 });
  }
}
