import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Role from '@/models/Role';
import Permission from '@/models/Permission'; // Import to register model for populate
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requireAdmin, forbiddenResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

// GET all roles - admin only
export async function GET(request: NextRequest) {
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can view roles
  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  try {
    await connectDB();
    
    // Ensure Permission model is registered on mongoose before populate
    // Access mongoose.models to ensure the model is registered
    if (!mongoose.models.Permission) {
      // Force registration by accessing the imported model
      const _ = Permission;
    }
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = {};
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    // Fetch roles with populate
    const roles = await Role.find(query)
      .populate('permissions', 'resource actions')
      .sort({ level: -1, name: 1 })
      .lean()
      .exec();

    // Ensure we always return an array
    const rolesData = Array.isArray(roles) ? roles : [];

    return NextResponse.json({ success: true, data: rolesData });
  } catch (error: any) {
    console.error('Error fetching roles:', error);
    // Provide more detailed error information
    const errorMessage = error.message || error.toString() || 'Failed to fetch roles';
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// POST create new role - admin only
export async function POST(request: NextRequest) {
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can create roles
  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  try {
    await connectDB();
    const body = await request.json();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Validate role name
    const validRoleNames = ['admin', 'doctor', 'nurse', 'receptionist', 'accountant', 'medical-representative'];
    if (body.name && !validRoleNames.includes(body.name)) {
      return NextResponse.json(
        { success: false, error: `Role name must be one of: ${validRoleNames.join(', ')}` },
        { status: 400 }
      );
    }

    // Ensure role is created with tenantId
    const roleData: any = { ...body };
    if (tenantId && !roleData.tenantId) {
      roleData.tenantId = new Types.ObjectId(tenantId);
    }

    const role = await Role.create(roleData);
    await role.populate('permissions', 'resource actions');

    return NextResponse.json({ success: true, data: role }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating role:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Role with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create role' },
      { status: 500 }
    );
  }
}

