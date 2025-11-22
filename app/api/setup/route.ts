import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Role from '@/models/Role';
import User from '@/models/User';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions';
import bcrypt from 'bcryptjs';

interface SetupData {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  clinicName?: string;
}

// Check if setup is already complete
export async function GET() {
  try {
    await connectDB();
    
    // Quick check: if no roles exist at all, definitely need setup
    const roleCount = await Role.countDocuments({});
    if (roleCount === 0) {
      return NextResponse.json({ 
        success: true, 
        setupComplete: false,
        message: 'Fresh database - setup required',
        isFreshDatabase: true
      });
    }
    
    // Check if admin role exists
    const adminRole = await Role.findOne({ name: 'admin' });
    if (!adminRole) {
      return NextResponse.json({ 
        success: true, 
        setupComplete: false,
        message: 'Setup required - admin role not found' 
      });
    }

    // Check if admin user exists
    const adminUser = await User.findOne({ role: adminRole._id });
    if (!adminUser) {
      return NextResponse.json({ 
        success: true, 
        setupComplete: false,
        message: 'Setup required - admin user not found' 
      });
    }

    return NextResponse.json({ 
      success: true, 
      setupComplete: true,
      message: 'Setup already complete' 
    });
  } catch (error: any) {
    // On any error (connection issues, etc.), assume setup is needed
    console.error('Error checking setup status:', error);
    return NextResponse.json({ 
      success: true, 
      setupComplete: false,
      message: 'Database connection issue - setup may be required',
      error: error.message 
    });
  }
}

// Run initial setup
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Check if setup is already complete
    const adminRole = await Role.findOne({ name: 'admin' });
    if (adminRole) {
      const adminUser = await User.findOne({ role: adminRole._id });
      if (adminUser) {
        return NextResponse.json(
          { success: false, error: 'Setup already completed. Admin user exists.' },
          { status: 400 }
        );
      }
    }

    const body: SetupData = await request.json();
    const { adminName, adminEmail, adminPassword, clinicName } = body;

    // Validate required fields
    if (!adminName || !adminEmail || !adminPassword) {
      return NextResponse.json(
        { success: false, error: 'Admin name, email, and password are required' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (adminPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Create default roles with permissions
    const roles = await createDefaultRoles();

    // Find admin role
    const adminRoleDoc = roles.find(r => r.name === 'admin');
    if (!adminRoleDoc) {
      return NextResponse.json(
        { success: false, error: 'Failed to create admin role' },
        { status: 500 }
      );
    }

    // Hash admin password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create admin user
    const adminUser = await User.create({
      name: adminName,
      email: adminEmail.toLowerCase().trim(),
      password: hashedPassword,
      role: adminRoleDoc._id,
      status: 'active',
    });

    // Create default settings
    let settingsCreated = false;
    try {
      await createDefaultSettings(clinicName || 'Clinic Management System', adminEmail.toLowerCase().trim());
      settingsCreated = true;
    } catch (error) {
      console.error('Failed to create default settings during setup:', error);
      // Continue with setup even if settings creation fails
      // Settings can be created/updated later via the settings page
    }

    // Count permissions created
    const Permission = (await import('@/models/Permission')).default;
    const permissionsCount = await Permission.countDocuments({ role: { $exists: true } });

    return NextResponse.json({
      success: true,
      message: 'Setup completed successfully',
      data: {
        adminUser: {
          _id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
        },
        rolesCreated: roles.length,
        permissionsCreated: permissionsCount,
        settingsCreated,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Setup error:', error);
    
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to complete setup' },
      { status: 500 }
    );
  }
}

// Create default roles with their permissions
async function createDefaultRoles() {
  const Permission = (await import('@/models/Permission')).default;
  const roles = [];

  // Admin role
  const adminRole = await Role.findOneAndUpdate(
    { name: 'admin' },
    {
      name: 'admin',
      displayName: 'Administrator',
      description: 'Full system access with all permissions',
      level: 100,
      isActive: true,
      defaultPermissions: [
        { resource: '*', actions: ['*'] },
      ],
    },
    { upsert: true, new: true }
  );
  
  // Create Permission documents for admin role
  const adminPermissions = [];
  try {
    for (const perm of adminRole.defaultPermissions || []) {
      const permission = await Permission.create({
        role: adminRole._id,
        resource: perm.resource,
        actions: perm.actions,
      });
      adminPermissions.push(permission._id);
    }
    adminRole.permissions = adminPermissions;
    await adminRole.save();
  } catch (error) {
    console.error('Error creating permissions for admin role:', error);
    // Continue even if permission creation fails - defaultPermissions will still work
  }
  
  roles.push(adminRole);

  // Doctor role
  const doctorRole = await Role.findOneAndUpdate(
    { name: 'doctor' },
    {
      name: 'doctor',
      displayName: 'Doctor',
      description: 'Clinical staff with access to patient care, visits, and prescriptions',
      level: 80,
      isActive: true,
      defaultPermissions: DEFAULT_ROLE_PERMISSIONS.doctor,
    },
    { upsert: true, new: true }
  );
  
  // Create Permission documents for doctor role
  const doctorPermissions = [];
  try {
    for (const perm of doctorRole.defaultPermissions || []) {
      const permission = await Permission.create({
        role: doctorRole._id,
        resource: perm.resource,
        actions: perm.actions,
      });
      doctorPermissions.push(permission._id);
    }
    doctorRole.permissions = doctorPermissions;
    await doctorRole.save();
  } catch (error) {
    console.error('Error creating permissions for doctor role:', error);
    // Continue even if permission creation fails
  }
  
  roles.push(doctorRole);

  // Nurse role
  const nurseRole = await Role.findOneAndUpdate(
    { name: 'nurse' },
    {
      name: 'nurse',
      displayName: 'Nurse',
      description: 'Clinical staff with access to patient care and lab results',
      level: 60,
      isActive: true,
      defaultPermissions: DEFAULT_ROLE_PERMISSIONS.nurse,
    },
    { upsert: true, new: true }
  );
  
  // Create Permission documents for nurse role
  const nursePermissions = [];
  try {
    for (const perm of nurseRole.defaultPermissions || []) {
      const permission = await Permission.create({
        role: nurseRole._id,
        resource: perm.resource,
        actions: perm.actions,
      });
      nursePermissions.push(permission._id);
    }
    nurseRole.permissions = nursePermissions;
    await nurseRole.save();
  } catch (error) {
    console.error('Error creating permissions for nurse role:', error);
    // Continue even if permission creation fails
  }
  
  roles.push(nurseRole);

  // Receptionist role
  const receptionistRole = await Role.findOneAndUpdate(
    { name: 'receptionist' },
    {
      name: 'receptionist',
      displayName: 'Receptionist',
      description: 'Front desk staff with access to appointments and patient management',
      level: 40,
      isActive: true,
      defaultPermissions: DEFAULT_ROLE_PERMISSIONS.receptionist,
    },
    { upsert: true, new: true }
  );
  
  // Create Permission documents for receptionist role
  const receptionistPermissions = [];
  try {
    for (const perm of receptionistRole.defaultPermissions || []) {
      const permission = await Permission.create({
        role: receptionistRole._id,
        resource: perm.resource,
        actions: perm.actions,
      });
      receptionistPermissions.push(permission._id);
    }
    receptionistRole.permissions = receptionistPermissions;
    await receptionistRole.save();
  } catch (error) {
    console.error('Error creating permissions for receptionist role:', error);
    // Continue even if permission creation fails
  }
  
  roles.push(receptionistRole);

  // Accountant role
  const accountantRole = await Role.findOneAndUpdate(
    { name: 'accountant' },
    {
      name: 'accountant',
      displayName: 'Accountant',
      description: 'Financial staff with access to billing and invoices',
      level: 30,
      isActive: true,
      defaultPermissions: DEFAULT_ROLE_PERMISSIONS.accountant,
    },
    { upsert: true, new: true }
  );
  
  // Create Permission documents for accountant role
  const accountantPermissions = [];
  try {
    for (const perm of accountantRole.defaultPermissions || []) {
      const permission = await Permission.create({
        role: accountantRole._id,
        resource: perm.resource,
        actions: perm.actions,
      });
      accountantPermissions.push(permission._id);
    }
    accountantRole.permissions = accountantPermissions;
    await accountantRole.save();
  } catch (error) {
    console.error('Error creating permissions for accountant role:', error);
    // Continue even if permission creation fails
  }
  
  roles.push(accountantRole);

  return roles;
}

// Create default settings
async function createDefaultSettings(clinicName: string, clinicEmail: string) {
  try {
    const Settings = (await import('@/models/Settings')).default;
    
    // Check if settings already exist
    const existingSettings = await Settings.findOne();
    if (existingSettings) {
      // Update existing settings with clinic name and email
      existingSettings.clinicName = clinicName;
      existingSettings.clinicEmail = clinicEmail;
      await existingSettings.save();
      return;
    }

    // Create new settings with all defaults
    await Settings.create({
      clinicName,
      clinicAddress: '',
      clinicPhone: '',
      clinicEmail,
      clinicWebsite: '',
      taxId: '',
      licenseNumber: '',
      businessHours: [
        { day: 'monday', open: '09:00', close: '17:00', closed: false },
        { day: 'tuesday', open: '09:00', close: '17:00', closed: false },
        { day: 'wednesday', open: '09:00', close: '17:00', closed: false },
        { day: 'thursday', open: '09:00', close: '17:00', closed: false },
        { day: 'friday', open: '09:00', close: '17:00', closed: false },
        { day: 'saturday', open: '09:00', close: '13:00', closed: false },
        { day: 'sunday', open: '09:00', close: '13:00', closed: true },
      ],
      appointmentSettings: {
        defaultDuration: 30,
        reminderHoursBefore: [24, 2],
        allowOnlineBooking: true,
        requireConfirmation: false,
        maxAdvanceBookingDays: 90,
        minAdvanceBookingHours: 2,
      },
      communicationSettings: {
        smsEnabled: false,
        emailEnabled: false,
        appointmentReminders: true,
        labResultNotifications: true,
        invoiceReminders: true,
      },
      billingSettings: {
        currency: 'USD',
        taxRate: 0,
        paymentTerms: 30,
        lateFeePercentage: 0,
        invoicePrefix: 'INV',
        allowPartialPayments: true,
      },
      queueSettings: {
        enableQueue: true,
        autoAssignRooms: false,
        estimatedWaitTimeMinutes: 15,
        displayQueuePublicly: false,
      },
      generalSettings: {
        timezone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
        itemsPerPage: 20,
        enableAuditLog: true,
        sessionTimeoutMinutes: 480, // 8 hours
      },
      integrationSettings: {
        cloudinaryEnabled: false,
        twilioEnabled: false,
        smtpEnabled: false,
      },
      displaySettings: {
        theme: 'light',
        sidebarCollapsed: true,
        showNotifications: true,
      },
    });
  } catch (error) {
    console.error('Failed to create default settings:', error);
    // Re-throw to be handled by caller
    throw error;
  }
}

