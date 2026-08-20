import { NextRequest, NextResponse } from 'next/server';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listUsers, countUsers, getUserByEmail, createUser } from '@/lib/data/user';
import { getRoleById, appRoleToRoleName } from '@/lib/data/role';
import { verifySession } from '@/app/lib/dal';
import { isAdmin } from '@/app/lib/auth-helpers';
import { sanitizeSearch } from '@/lib/utils';
import type { Prisma } from '@prisma/client';

// GET /api/users - Get all users
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can view all users
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const role = searchParams.get('role');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const skip = (page - 1) * limit;

    // Build query filters (tenantId itself is injected by runWithTenant's
    // Prisma extension when a tenant is active; the explicit branch below
    // only decides which context wrapper runs the query).
    const where: Prisma.UserWhereInput = {};
    if (status) where.status = status as Prisma.UserWhereInput['status'];
    if (role) where.role = { name: appRoleToRoleName(role) };
    if (search) {
      const safeSearch = sanitizeSearch(search);
      where.OR = [
        { name: { contains: safeSearch, mode: 'insensitive' } },
        { email: { contains: safeSearch, mode: 'insensitive' } },
      ];
    }

    // Explicit tenant branch: a resolved session.tenantId -> runWithTenant
    // (the extension auto-scopes the User query); no tenantId (legacy
    // no-subdomain mode) -> runAsSystem, with no tenantId condition added to
    // `where` at all — matching today's Mongoose `$or` legacy-mode
    // semantics as closely as Postgres's nullable-column model allows.
    const tenantId = session.tenantId;
    const load = async () => {
      const [paged, total] = await Promise.all([
        listUsers(where, { skip, take: limit }),
        countUsers(where),
      ]);
      return { paged, total };
    };
    const { paged, total } = tenantId ? await runWithTenant(tenantId, load) : await runAsSystem(load);

    return NextResponse.json({
      success: true,
      data: paged,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch users' }, { status: 500 });
  }
}

// POST /api/users - Create a new user (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, role, status } = body;

    if (!name || !email || !password || !role) {
      return NextResponse.json({ success: false, error: 'Name, email, password, and role are required' }, { status: 400 });
    }

    // Explicit tenant branch: a resolved session.tenantId -> runWithTenant
    // (auto-scoped User/Role queries+create); no tenantId (legacy
    // no-subdomain mode) -> runAsSystem, with tenantId-less filters passed
    // explicitly (see GET handler above for the same rationale).
    const tenantId = session.tenantId;
    const create = async () => {
      // Check if user already exists
      const existingUser = tenantId ? await getUserByEmail(email, tenantId) : await getUserByEmail(email);
      if (existingUser) {
        return { error: 'User with this email already exists' as const };
      }

      // Verify role exists (tenant-scoped by the active context)
      const roleDoc = await getRoleById(role);
      if (!roleDoc) {
        return { error: 'Invalid role' as const };
      }

      // Hash password
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await createUser({
        name,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: { connect: { id: role } },
        status: status || 'active',
        ...(tenantId ? { tenant: { connect: { id: tenantId } } } : {}),
      } as Prisma.UserCreateInput);

      return { user };
    };

    const result = tenantId ? await runWithTenant(tenantId, create) : await runAsSystem(create);

    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: result.user,
      message: 'User created successfully',
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating user:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'User with this email already exists' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message || 'Failed to create user' }, { status: 500 });
  }
}
