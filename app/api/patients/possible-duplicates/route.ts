import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { escapeRegex } from '@/lib/api/validate';

/**
 * GET /api/patients/possible-duplicates?firstName=&lastName=&dateOfBirth=YYYY-MM-DD&phone=&exclude=
 *
 * Patients of this clinic who may be the person being registered: same first and last name,
 * same last name and birth date, or the same phone number (compared on its last 10 digits,
 * whatever the spacing). At most 5, each with the reasons it matched. Never looks outside the
 * signed-in clinic.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  const sp = request.nextUrl.searchParams;
  const firstName = (sp.get('firstName') ?? '').trim().slice(0, 100);
  const lastName = (sp.get('lastName') ?? '').trim().slice(0, 100);
  const dob = (sp.get('dateOfBirth') ?? '').trim();
  const digits = (sp.get('phone') ?? '').replace(/\D/g, '').slice(-10);
  const exclude = sp.get('exclude') ?? '';

  const exact = (s: string) => new RegExp(`^${escapeRegex(s)}$`, 'i');
  const or: Record<string, unknown>[] = [];
  if (firstName.length >= 2 && lastName.length >= 2) or.push({ firstName: exact(firstName), lastName: exact(lastName) });

  let dayStart: Date | null = null;
  if (lastName.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const d = new Date(`${dob}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) {
      dayStart = d;
      or.push({ lastName: exact(lastName), dateOfBirth: { $gte: d, $lt: new Date(d.getTime() + 86_400_000) } });
    }
  }

  const phonePattern = digits.length >= 7 ? new RegExp(`${digits.split('').join('\\D*')}\\D*$`) : null;
  if (phonePattern) or.push({ phone: phonePattern });

  if (or.length === 0) return NextResponse.json({ success: true, data: [] });

  try {
    await connectDB();
    const rows = await Patient.find({
      tenantIds: ctx.tenantObjectId,
      $or: or,
      ...(isValidId(exclude) ? { _id: { $ne: exclude } } : {}),
    })
      .select('firstName middleName lastName suffix patientCode dateOfBirth phone')
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    const same = (a?: string, b?: string) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
    type Row = { _id: unknown; firstName?: string; middleName?: string; lastName?: string; suffix?: string; patientCode?: string; dateOfBirth?: Date; phone?: string };
    const data = (rows as unknown as Row[]).map((p) => {
      const born = p.dateOfBirth ? new Date(p.dateOfBirth) : null;
      const reasons: ('name' | 'birth' | 'phone')[] = [];
      if (same(p.firstName, firstName) && same(p.lastName, lastName)) reasons.push('name');
      if (dayStart && born && same(p.lastName, lastName) && born.getTime() >= dayStart.getTime() && born.getTime() < dayStart.getTime() + 86_400_000) reasons.push('birth');
      if (phonePattern && typeof p.phone === 'string' && phonePattern.test(p.phone)) reasons.push('phone');
      return {
        _id: String(p._id),
        patientCode: p.patientCode ?? null,
        name: [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' '),
        dateOfBirth: born ? born.toISOString() : null,
        phone: p.phone ?? null,
        reasons,
      };
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error checking for duplicate patients:', error);
    return NextResponse.json({ success: false, error: 'Failed to check for duplicates' }, { status: 500 });
  }
}
