import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { sanitizeSearch } from '@/lib/utils';
import type { Prisma } from '@prisma/client';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

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
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const safeSearch = search ? sanitizeSearch(search) : '';

    const results = await run(tenantId, async () => {
      // 1. Query Medicine catalog — primary source, returns full suggestion objects
      const medicineWhere: Prisma.MedicineWhereInput = { active: true };
      if (search) {
        medicineWhere.OR = [
          { name: { contains: safeSearch, mode: 'insensitive' } },
          { genericName: { contains: safeSearch, mode: 'insensitive' } },
          { brandNames: { has: safeSearch } },
        ];
      }
      const medicines = await prisma.medicine.findMany({
        where: medicineWhere,
        select: { name: true, genericName: true, standardDosage: true, standardFrequency: true, duration: true },
        take: 50,
      });

      // Build catalog suggestions (name entry + generic name entry)
      const catalogMap = new Map<string, MedicineSuggestion>();
      for (const med of medicines) {
        const suggestion: MedicineSuggestion = {
          name: med.name,
          dosage: med.standardDosage || '',
          frequency: med.standardFrequency || '',
          duration: med.duration || '',
          source: 'catalog',
        };
        catalogMap.set(med.name.toLowerCase(), suggestion);

        if (med.genericName && !catalogMap.has(med.genericName.toLowerCase())) {
          catalogMap.set(med.genericName.toLowerCase(), {
            name: med.genericName,
            dosage: med.standardDosage || '',
            frequency: med.standardFrequency || '',
            duration: med.duration || '',
            source: 'catalog',
          });
        }
      }

      // 2. Aggregate unique medication names from past visits (as fallback history)
      // VisitTreatmentMedication is a child table with no tenantId column of
      // its own (see lib/prisma-tenant-extension.ts) — the tenant extension
      // cannot scope it automatically, so the tenant filter is applied
      // explicitly through the parent Visit relation here.
      const visitMedicationWhere: Prisma.VisitTreatmentMedicationWhereInput = {
        visit: tenantId ? { tenantId } : undefined,
      };
      if (search) visitMedicationWhere.name = { contains: safeSearch, mode: 'insensitive' };
      const visitMedications = await prisma.visitTreatmentMedication.findMany({
        where: visitMedicationWhere,
        select: { name: true, dosage: true, frequency: true, duration: true },
        orderBy: { name: 'asc' },
      });
      for (const v of visitMedications) {
        if (!v.name) continue;
        const key = v.name.toLowerCase();
        if (!catalogMap.has(key)) {
          catalogMap.set(key, {
            name: v.name,
            dosage: v.dosage || '',
            frequency: v.frequency || '',
            duration: v.duration || '',
            source: 'history',
          });
        }
      }

      // 3. Sort catalog first, then history; alphabetical within each group
      return Array.from(catalogMap.values())
        .sort((a, b) => {
          if (a.source !== b.source) return a.source === 'catalog' ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .slice(0, 30);
    });

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Error fetching medication names:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch medication names' }, { status: 500 });
  }
}
