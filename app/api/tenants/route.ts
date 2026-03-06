import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, isAdmin } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    // Only expose minimal fields needed for subdomain/clinic selection UI
    const tenants = await Tenant.find({ isActive: true }).select('slug name isActive').lean();
    return NextResponse.json({ success: true, data: tenants });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Require admin authentication to create tenants
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    await connectDB();

    const body = await request.json();
    const { slug, name, domain, subdomain, currency, language, email, phone, companyName } = body;

    if (!slug || !name) {
      return NextResponse.json(
        { success: false, error: 'Slug and name are required' },
        { status: 400 }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { success: false, error: 'Slug can only contain lowercase letters, numbers, and hyphens' },
        { status: 400 }
      );
    }

    // Check if tenant already exists
    const existing = await Tenant.findOne({
      $or: [
        { slug: slug.toLowerCase() },
        ...(domain ? [{ domain }] : []),
        ...(subdomain ? [{ subdomain: subdomain.toLowerCase() }] : []),
      ]
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Tenant with this slug, domain, or subdomain already exists' },
        { status: 400 }
      );
    }

    // Get default settings and customize
    const defaultSettings = getDefaultTenantSettings();
    const settings = {
      ...defaultSettings,
      currency: currency || defaultSettings.currency,
      language: (language === 'es' ? 'es' : 'en') as 'en' | 'es',
      ...(email && { email }),
      ...(phone && { phone }),
      ...(companyName && { companyName }),
    };

    const tenantData: any = {
      slug: slug.toLowerCase(),
      name,
      settings,
      isActive: true,
    };

    if (domain) tenantData.domain = domain;
    if (subdomain) tenantData.subdomain = subdomain.toLowerCase();

    const tenant = await Tenant.create(tenantData);

    // Automatically create admin user for the tenant
    const adminEmail = `admin@${tenant.slug}.local`;
    // Cryptographically random temporary password (not Math.random)
    const tempPassword = randomBytes(12).toString('base64url');
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    try {
      await User.create({
        email: adminEmail,
        password: hashedPassword,
        name: 'Administrator',
        role: 'admin',
        tenantId: tenant._id,
        isActive: true,
      });
    } catch (userError: any) {
      console.error('Failed to create admin user:', userError.message);
    }

    return NextResponse.json({
      success: true,
      data: tenant,
      adminUser: {
        email: adminEmail,
        temporaryPassword: tempPassword,
        note: 'Temporary password — change immediately after first login.',
      },
    }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return NextResponse.json(
        { success: false, error: `${field} already exists` },
        { status: 400 }
      );
    }
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

function getDefaultTenantSettings() {
    return {
        currency: 'USD',
        language: 'en',
        timezone: 'UTC',
        email: '',
        phone: '',
        companyName: '',
        theme: 'default',
        notifications: {
            email: true,
            sms: false,
        },
        features: {
            billing: true,
            inventory: true,
            lab: true,
            auditLogging: true,
            notifications: true,
        },
    };
}

