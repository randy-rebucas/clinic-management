import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';

// This is a placeholder for pharmacy integration
// In production, this would connect to actual pharmacy APIs or a pharmacy database

export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  phone: string;
  email?: string;
  apiEndpoint?: string; // For API integration
  apiKey?: string; // For API authentication
}

// Mock pharmacy data - in production, this would be from a database
const MOCK_PHARMACIES: Pharmacy[] = [
  {
    id: '1',
    name: 'City Pharmacy',
    address: '123 Main St, City',
    phone: '+1-234-567-8900',
    email: 'info@citypharmacy.com',
  },
  {
    id: '2',
    name: 'Health Plus Pharmacy',
    address: '456 Oak Ave, City',
    phone: '+1-234-567-8901',
    email: 'contact@healthplus.com',
  },
];

// Pharmacies added at runtime, per clinic (placeholder until pharmacies get a model).
const TENANT_PHARMACIES = new Map<string, Pharmacy[]>();

const publicView = (p: Pharmacy) => ({ id: p.id, name: p.name, address: p.address, phone: p.phone, email: p.email });

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');

    // Note: Pharmacies are currently mock data. In production, they should be stored in a database with tenantId
    // For now, we return all pharmacies as they're typically shared across tenants
    let pharmacies = [...MOCK_PHARMACIES, ...(TENANT_PHARMACIES.get(ctx.tenantId) || [])];

    if (search) {
      const lowerSearch = search.toLowerCase();
      pharmacies = pharmacies.filter(
        (p) =>
          p.name.toLowerCase().includes(lowerSearch) ||
          p.address.toLowerCase().includes(lowerSearch)
      );
    }

    return NextResponse.json({ success: true, data: pharmacies.map(publicView) });
  } catch (error: any) {
    console.error('Error fetching pharmacies:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch pharmacies' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  // Only admins can add pharmacies
  if (ctx.session.role !== 'admin' && ctx.session.role !== 'owner') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const name = text(body?.name, 200);
    if (!name) {
      return NextResponse.json({ success: false, error: 'Pharmacy name is required' }, { status: 400 });
    }
    const list = TENANT_PHARMACIES.get(ctx.tenantId) || [];
    // In production, save to database
    const newPharmacy: Pharmacy = {
      id: `${ctx.tenantId.slice(-6)}-${list.length + 1}`,
      name,
      address: text(body?.address, 500),
      phone: text(body?.phone, 50),
      email: text(body?.email, 254) || undefined,
    };
    list.push(newPharmacy);
    TENANT_PHARMACIES.set(ctx.tenantId, list.slice(-200));

    return NextResponse.json({ success: true, data: publicView(newPharmacy) }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating pharmacy:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create pharmacy' },
      { status: 500 }
    );
  }
}

