import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';

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

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');

    // Note: Pharmacies are currently mock data. In production, they should be stored in a database with tenantId
    // For now, we return all pharmacies as they're typically shared across tenants
    let pharmacies = MOCK_PHARMACIES;

    if (search) {
      const lowerSearch = search.toLowerCase();
      pharmacies = pharmacies.filter(
        (p) =>
          p.name.toLowerCase().includes(lowerSearch) ||
          p.address.toLowerCase().includes(lowerSearch)
      );
    }

    return NextResponse.json({ success: true, data: pharmacies });
  } catch (error: any) {
    console.error('Error fetching pharmacies:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch pharmacies' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admins can add pharmacies
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    // In production, save to database
    const newPharmacy: Pharmacy = {
      id: String(MOCK_PHARMACIES.length + 1),
      ...body,
    };
    MOCK_PHARMACIES.push(newPharmacy);

    return NextResponse.json({ success: true, data: newPharmacy }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating pharmacy:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create pharmacy' },
      { status: 500 }
    );
  }
}

