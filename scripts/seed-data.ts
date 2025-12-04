import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Import all models from index (ensures proper registration order)
import {
  User,
  Role,
  Permission,
  Staff,
  Admin,
  Doctor,
  Nurse,
  Receptionist,
  Accountant,
  MedicalRepresentative,
  Patient,
  Service,
  Medicine,
  InventoryItem,
  Room,
  Appointment,
  Visit,
  Prescription,
  LabResult,
  Imaging,
  Procedure,
  Invoice,
  Document,
  Referral,
  Queue,
  Notification,
  Membership,
  Settings,
  AuditLog,
} from '../models';
import { DEFAULT_ROLE_PERMISSIONS } from '../lib/permissions';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

// Store created IDs for references
const seedData: {
  roles: any[];
  users: any[];
  staff: any[];
  admins: any[];
  doctors: any[];
  nurses: any[];
  receptionists: any[];
  accountants: any[];
  medicalRepresentatives: any[];
  patients: any[];
  services: any[];
  medicines: any[];
  inventory: any[];
  rooms: any[];
  appointments: any[];
  visits: any[];
  prescriptions: any[];
  labResults: any[];
  imaging: any[];
  procedures: any[];
  invoices: any[];
  documents: any[];
  referrals: any[];
  queues: any[];
  memberships: any[];
  auditLogs: any[];
} = {
  roles: [],
  users: [],
  staff: [],
  admins: [],
  doctors: [],
  nurses: [],
  receptionists: [],
  accountants: [],
  medicalRepresentatives: [],
  patients: [],
  services: [],
  medicines: [],
  inventory: [],
  rooms: [],
  appointments: [],
  visits: [],
  prescriptions: [],
  labResults: [],
  imaging: [],
  procedures: [],
  invoices: [],
  documents: [],
  referrals: [],
  queues: [],
  memberships: [],
  auditLogs: [],
};

async function seedDataScript() {
  try {
    console.log('🌱 Starting seed data generation...\n');

    // Connect to database
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('📡 Connecting to database...');
    await mongoose.connect(MONGODB_URI, { bufferCommands: false });
    console.log('✅ Connected to database\n');

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('🗑️  Clearing existing data...');
    await Promise.all([
      // Audit & Notifications
      AuditLog.deleteMany({}),
      Notification.deleteMany({}),
      // Queue & Membership
      Queue.deleteMany({}),
      Membership.deleteMany({}),
      // Documents & Referrals
      Referral.deleteMany({}),
      Document.deleteMany({}),
      // Billing
      Invoice.deleteMany({}),
      // Clinical records
      Procedure.deleteMany({}),
      Imaging.deleteMany({}),
      LabResult.deleteMany({}),
      Prescription.deleteMany({}),
      Visit.deleteMany({}),
      Appointment.deleteMany({}),
      // Inventory & Catalog
      InventoryItem.deleteMany({}),
      Medicine.deleteMany({}),
      Service.deleteMany({}),
      Room.deleteMany({}),
      // Patient
      Patient.deleteMany({}),
      // Profile models (these have post-save hooks that create Users)
      MedicalRepresentative.deleteMany({}),
      Accountant.deleteMany({}),
      Receptionist.deleteMany({}),
      Nurse.deleteMany({}),
      Doctor.deleteMany({}),
      Admin.deleteMany({}),
      Staff.deleteMany({}),
      // Auth
      User.deleteMany({}),
      Permission.deleteMany({}),
      Role.deleteMany({}),
    ]);
    console.log('✅ Existing data cleared\n');

    // 1. Create Roles (matching setup route pattern)
    console.log('📋 Creating roles...');
    
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
    // First, clear any existing permissions for this role to avoid duplicates
    await Permission.deleteMany({ role: adminRole._id });
    
    const adminPermissions = [];
    try {
      for (const perm of adminRole.defaultPermissions || []) {
        const permission = await Permission.create({
          role: adminRole._id, // Reference to Role model
          resource: perm.resource,
          actions: perm.actions,
        });
        adminPermissions.push(permission._id);
      }
      // Update role with Permission document references
      adminRole.permissions = adminPermissions;
      await adminRole.save();
      console.log(`   ✓ Created role: ${adminRole.displayName} with ${adminPermissions.length} permission(s)`);
    } catch (error: any) {
      console.error('   ⚠️  Error creating permissions for admin role:', error.message);
      // Continue even if permission creation fails - defaultPermissions will still work
      console.log(`   ✓ Created role: ${adminRole.displayName} (permissions creation failed, using defaultPermissions)`);
    }
    seedData.roles.push(adminRole);

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
    // First, clear any existing permissions for this role to avoid duplicates
    await Permission.deleteMany({ role: doctorRole._id });
    
    const doctorPermissions = [];
    try {
      for (const perm of doctorRole.defaultPermissions || []) {
        const permission = await Permission.create({
          role: doctorRole._id, // Reference to Role model
          resource: perm.resource,
          actions: perm.actions,
        });
        doctorPermissions.push(permission._id);
      }
      // Update role with Permission document references
      doctorRole.permissions = doctorPermissions;
      await doctorRole.save();
      console.log(`   ✓ Created role: ${doctorRole.displayName} with ${doctorPermissions.length} permission(s)`);
    } catch (error: any) {
      console.error('   ⚠️  Error creating permissions for doctor role:', error.message);
      // Continue even if permission creation fails
      console.log(`   ✓ Created role: ${doctorRole.displayName} (permissions creation failed, using defaultPermissions)`);
    }
    seedData.roles.push(doctorRole);

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
    // First, clear any existing permissions for this role to avoid duplicates
    await Permission.deleteMany({ role: nurseRole._id });
    
    const nursePermissions = [];
    try {
      for (const perm of nurseRole.defaultPermissions || []) {
        const permission = await Permission.create({
          role: nurseRole._id, // Reference to Role model
          resource: perm.resource,
          actions: perm.actions,
        });
        nursePermissions.push(permission._id);
      }
      // Update role with Permission document references
      nurseRole.permissions = nursePermissions;
      await nurseRole.save();
      console.log(`   ✓ Created role: ${nurseRole.displayName} with ${nursePermissions.length} permission(s)`);
    } catch (error: any) {
      console.error('   ⚠️  Error creating permissions for nurse role:', error.message);
      // Continue even if permission creation fails
      console.log(`   ✓ Created role: ${nurseRole.displayName} (permissions creation failed, using defaultPermissions)`);
    }
    seedData.roles.push(nurseRole);

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
    // First, clear any existing permissions for this role to avoid duplicates
    await Permission.deleteMany({ role: receptionistRole._id });
    
    const receptionistPermissions = [];
    try {
      for (const perm of receptionistRole.defaultPermissions || []) {
        const permission = await Permission.create({
          role: receptionistRole._id, // Reference to Role model
          resource: perm.resource,
          actions: perm.actions,
        });
        receptionistPermissions.push(permission._id);
      }
      // Update role with Permission document references
      receptionistRole.permissions = receptionistPermissions;
      await receptionistRole.save();
      console.log(`   ✓ Created role: ${receptionistRole.displayName} with ${receptionistPermissions.length} permission(s)`);
    } catch (error: any) {
      console.error('   ⚠️  Error creating permissions for receptionist role:', error.message);
      // Continue even if permission creation fails
      console.log(`   ✓ Created role: ${receptionistRole.displayName} (permissions creation failed, using defaultPermissions)`);
    }
    seedData.roles.push(receptionistRole);

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
    // First, clear any existing permissions for this role to avoid duplicates
    await Permission.deleteMany({ role: accountantRole._id });
    
    const accountantPermissions = [];
    try {
      for (const perm of accountantRole.defaultPermissions || []) {
        const permission = await Permission.create({
          role: accountantRole._id, // Reference to Role model
          resource: perm.resource,
          actions: perm.actions,
        });
        accountantPermissions.push(permission._id);
      }
      // Update role with Permission document references
      accountantRole.permissions = accountantPermissions;
      await accountantRole.save();
      console.log(`   ✓ Created role: ${accountantRole.displayName} with ${accountantPermissions.length} permission(s)`);
    } catch (error: any) {
      console.error('   ⚠️  Error creating permissions for accountant role:', error.message);
      // Continue even if permission creation fails
      console.log(`   ✓ Created role: ${accountantRole.displayName} (permissions creation failed, using defaultPermissions)`);
    }
    seedData.roles.push(accountantRole);

    // Medical Representative role
    const medicalRepRole = await Role.findOneAndUpdate(
      { name: 'medical-representative' },
      {
        name: 'medical-representative',
        displayName: 'Medical Representative',
        description: 'External medical representatives with limited access',
        level: 20,
        isActive: true,
        defaultPermissions: DEFAULT_ROLE_PERMISSIONS['medical-representative'] || [
          { resource: 'appointments', actions: ['read', 'create'] },
          { resource: 'doctors', actions: ['read'] },
        ],
      },
      { upsert: true, new: true }
    );
    
    // Create Permission documents for medical-representative role
    await Permission.deleteMany({ role: medicalRepRole._id });
    
    const medicalRepPermissions = [];
    try {
      for (const perm of medicalRepRole.defaultPermissions || []) {
        const permission = await Permission.create({
          role: medicalRepRole._id,
          resource: perm.resource,
          actions: perm.actions,
        });
        medicalRepPermissions.push(permission._id);
      }
      medicalRepRole.permissions = medicalRepPermissions;
      await medicalRepRole.save();
      console.log(`   ✓ Created role: ${medicalRepRole.displayName} with ${medicalRepPermissions.length} permission(s)`);
    } catch (error: any) {
      console.error('   ⚠️  Error creating permissions for medical-representative role:', error.message);
      console.log(`   ✓ Created role: ${medicalRepRole.displayName} (permissions creation failed, using defaultPermissions)`);
    }
    seedData.roles.push(medicalRepRole);

    console.log('✅ Roles created\n');

    // 2. Create Admin Profiles (auto-creates User via post-save hook)
    console.log('👑 Creating admin profiles...');
    const adminsData = [
      { firstName: 'Admin', lastName: 'User', email: 'admin@clinic.com', phone: '+1-555-0001' },
    ];

    for (const adminData of adminsData) {
      const admin = await Admin.create({
        ...adminData,
        title: 'Mr.',
        department: 'Administration',
        accessLevel: 'full',
        status: 'active',
      });
      seedData.admins.push(admin);
      
      // Get the auto-created user
      const user = await User.findOne({ adminProfile: admin._id });
      if (user) {
        seedData.users.push(user);
        console.log(`   ✓ Created admin: ${admin.firstName} ${admin.lastName} (user auto-created: ${user.email})`);
      } else {
        console.log(`   ✓ Created admin: ${admin.firstName} ${admin.lastName} (user creation pending)`);
      }
    }
    console.log('✅ Admin profiles created\n');

    // 3. Create Doctor Profiles (auto-creates User via post-save hook)
    console.log('🩺 Creating doctor profiles...');
    const doctorsData = [
      { firstName: 'John', lastName: 'Smith', email: 'doctor1@clinic.com', specialization: 'General Medicine' },
      { firstName: 'Sarah', lastName: 'Johnson', email: 'doctor2@clinic.com', specialization: 'Cardiology' },
    ];

    for (let i = 0; i < doctorsData.length; i++) {
      const docData = doctorsData[i];
      const doctor = await Doctor.create({
        firstName: docData.firstName,
        lastName: docData.lastName,
        email: docData.email,
        phone: `+1-555-${String(3000 + i).padStart(4, '0')}`,
        specialization: docData.specialization,
        licenseNumber: `LIC-${String(1000 + i).padStart(6, '0')}`,
        schedule: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isAvailable: true },
        ],
        title: 'Dr.',
        qualifications: ['MD', 'Board Certified'],
        bio: `Experienced ${docData.specialization} specialist`,
        department: docData.specialization,
        status: 'active',
        performanceMetrics: {
          totalAppointments: 0,
          completedAppointments: 0,
          cancelledAppointments: 0,
          noShowAppointments: 0,
          lastUpdated: new Date(),
        },
      });
      seedData.doctors.push(doctor);
      
      // Get the auto-created user
      const user = await User.findOne({ doctorProfile: doctor._id });
      if (user) {
        seedData.users.push(user);
        console.log(`   ✓ Created doctor: Dr. ${doctor.firstName} ${doctor.lastName} (user auto-created: ${user.email})`);
      } else {
        console.log(`   ✓ Created doctor: Dr. ${doctor.firstName} ${doctor.lastName} (user creation pending)`);
      }
    }
    console.log('✅ Doctor profiles created\n');

    // 4. Create Nurse Profiles (auto-creates User via post-save hook)
    console.log('💉 Creating nurse profiles...');
    const nursesData = [
      { firstName: 'Mary', lastName: 'Williams', email: 'nurse1@clinic.com', specialization: 'Emergency' },
      { firstName: 'James', lastName: 'Brown', email: 'nurse2@clinic.com', specialization: 'Pediatrics' },
    ];

    for (let i = 0; i < nursesData.length; i++) {
      const nurseData = nursesData[i];
      const nurse = await Nurse.create({
        firstName: nurseData.firstName,
        lastName: nurseData.lastName,
        email: nurseData.email,
        phone: `+1-555-${String(4000 + i).padStart(4, '0')}`,
        employeeId: `NRS-${String(i + 1).padStart(4, '0')}`,
        licenseNumber: `NL-${String(2000 + i).padStart(6, '0')}`,
        department: 'Nursing',
        specialization: nurseData.specialization,
        hireDate: new Date(2023, 0, 1),
        address: `${200 + i} Health Avenue, City, State 12345`,
        schedule: [
          { dayOfWeek: 1, startTime: '08:00', endTime: '16:00', isAvailable: true },
          { dayOfWeek: 2, startTime: '08:00', endTime: '16:00', isAvailable: true },
          { dayOfWeek: 3, startTime: '08:00', endTime: '16:00', isAvailable: true },
          { dayOfWeek: 4, startTime: '08:00', endTime: '16:00', isAvailable: true },
          { dayOfWeek: 5, startTime: '08:00', endTime: '16:00', isAvailable: true },
        ],
        emergencyContact: {
          name: `Emergency Contact ${i + 1}`,
          phone: `+1-555-${String(2000 + i).padStart(4, '0')}`,
          relationship: 'Spouse',
        },
        title: 'RN',
        qualifications: ['BSN', 'Licensed Nurse'],
        status: 'active',
      });
      seedData.nurses.push(nurse);
      
      // Get the auto-created user
      const user = await User.findOne({ nurseProfile: nurse._id });
      if (user) {
        seedData.users.push(user);
        console.log(`   ✓ Created nurse: ${nurse.firstName} ${nurse.lastName} (user auto-created: ${user.email})`);
      } else {
        console.log(`   ✓ Created nurse: ${nurse.firstName} ${nurse.lastName} (user creation pending)`);
      }
    }
    console.log('✅ Nurse profiles created\n');

    // 5. Create Receptionist Profiles (auto-creates User via post-save hook)
    console.log('📞 Creating receptionist profiles...');
    const receptionistsData = [
      { firstName: 'Alice', lastName: 'Davis', email: 'receptionist@clinic.com' },
    ];

    for (let i = 0; i < receptionistsData.length; i++) {
      const recepData = receptionistsData[i];
      const receptionist = await Receptionist.create({
        firstName: recepData.firstName,
        lastName: recepData.lastName,
        email: recepData.email,
        phone: `+1-555-${String(5000 + i).padStart(4, '0')}`,
        employeeId: `RCP-${String(i + 1).padStart(4, '0')}`,
        department: 'Front Desk',
        hireDate: new Date(2023, 0, 1),
        address: `${300 + i} Welcome Street, City, State 12345`,
        schedule: [
          { dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 2, startTime: '08:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 3, startTime: '08:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 4, startTime: '08:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 5, startTime: '08:00', endTime: '17:00', isAvailable: true },
        ],
        emergencyContact: {
          name: 'Emergency Contact',
          phone: '+1-555-2100',
          relationship: 'Parent',
        },
        status: 'active',
      });
      seedData.receptionists.push(receptionist);
      
      // Get the auto-created user
      const user = await User.findOne({ receptionistProfile: receptionist._id });
      if (user) {
        seedData.users.push(user);
        console.log(`   ✓ Created receptionist: ${receptionist.firstName} ${receptionist.lastName} (user auto-created: ${user.email})`);
      } else {
        console.log(`   ✓ Created receptionist: ${receptionist.firstName} ${receptionist.lastName} (user creation pending)`);
      }
    }
    console.log('✅ Receptionist profiles created\n');

    // 6. Create Accountant Profiles (auto-creates User via post-save hook)
    console.log('💼 Creating accountant profiles...');
    const accountantsData = [
      { firstName: 'Bob', lastName: 'Wilson', email: 'accountant@clinic.com' },
    ];

    for (let i = 0; i < accountantsData.length; i++) {
      const acctData = accountantsData[i];
      const accountant = await Accountant.create({
        firstName: acctData.firstName,
        lastName: acctData.lastName,
        email: acctData.email,
        phone: `+1-555-${String(6000 + i).padStart(4, '0')}`,
        employeeId: `ACC-${String(i + 1).padStart(4, '0')}`,
        department: 'Finance',
        certification: 'CPA',
        licenseNumber: `CPA-${String(3000 + i).padStart(6, '0')}`,
        hireDate: new Date(2023, 0, 1),
        address: `${400 + i} Finance Blvd, City, State 12345`,
        schedule: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isAvailable: true },
        ],
        emergencyContact: {
          name: 'Emergency Contact',
          phone: '+1-555-2200',
          relationship: 'Spouse',
        },
        status: 'active',
      });
      seedData.accountants.push(accountant);
      
      // Get the auto-created user
      const user = await User.findOne({ accountantProfile: accountant._id });
      if (user) {
        seedData.users.push(user);
        console.log(`   ✓ Created accountant: ${accountant.firstName} ${accountant.lastName} (user auto-created: ${user.email})`);
      } else {
        console.log(`   ✓ Created accountant: ${accountant.firstName} ${accountant.lastName} (user creation pending)`);
      }
    }
    console.log('✅ Accountant profiles created\n');

    // 7. Create Medical Representative Profiles (auto-creates User via post-save hook)
    console.log('🧬 Creating medical representative profiles...');
    const medRepsData = [
      { firstName: 'Mike', lastName: 'Johnson', email: 'medrep1@pharma.com', company: 'Pharma Corp' },
      { firstName: 'Lisa', lastName: 'Anderson', email: 'medrep2@biotech.com', company: 'BioTech Inc' },
    ];

    for (let i = 0; i < medRepsData.length; i++) {
      const medRepData = medRepsData[i];
      const medRep = await MedicalRepresentative.create({
        firstName: medRepData.firstName,
        lastName: medRepData.lastName,
        email: medRepData.email,
        phone: `+1-555-${String(7000 + i).padStart(4, '0')}`,
        company: medRepData.company,
        territory: 'Metro Area',
        products: ['Drug A', 'Drug B', 'Drug C'],
        availability: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isAvailable: true },
        ],
        title: 'Mr.',
        bio: `Medical Representative at ${medRepData.company}`,
        status: 'active',
      });
      seedData.medicalRepresentatives.push(medRep);
      
      // Get the auto-created user
      const user = await User.findOne({ medicalRepresentativeProfile: medRep._id });
      if (user) {
        seedData.users.push(user);
        console.log(`   ✓ Created medical rep: ${medRep.firstName} ${medRep.lastName} (user auto-created: ${user.email})`);
      } else {
        console.log(`   ✓ Created medical rep: ${medRep.firstName} ${medRep.lastName} (user creation pending)`);
      }
    }
    console.log('✅ Medical representative profiles created\n');

    // Get doctor users for later use
    const doctorUsers = seedData.users.filter(u => u.doctorProfile);

    // 8. Create Patients
    console.log('🏥 Creating patients...');
    const patientsData = [
      {
        firstName: 'John', middleName: 'Michael', lastName: 'Doe', suffix: 'Jr.', 
        email: 'john.doe@example.com', phone: '+1-555-0101',
        dateOfBirth: new Date(1985, 5, 15), sex: 'male', civilStatus: 'married', 
        nationality: 'US', occupation: 'Engineer',
        discountEligibility: { senior: { eligible: false }, pwd: { eligible: false } },
        preExistingConditions: [
          { condition: 'Hypertension', diagnosisDate: new Date(2020, 0, 1), status: 'chronic', notes: 'Controlled with medication' }
        ],
        socialHistory: { smoker: 'never', alcohol: 'social', drugs: 'none' },
        immunizations: [
          { name: 'COVID-19', date: new Date(2021, 5, 1), batch: 'PF-2021-001', notes: 'First dose' },
          { name: 'COVID-19', date: new Date(2021, 6, 1), batch: 'PF-2021-002', notes: 'Second dose' }
        ],
      },
      {
        firstName: 'Jane', lastName: 'Smith', 
        email: 'jane.smith@example.com', phone: '+1-555-0102',
        dateOfBirth: new Date(1970, 3, 20), sex: 'female', civilStatus: 'widowed',
        nationality: 'US', occupation: 'Teacher',
        discountEligibility: { senior: { eligible: true, idNumber: 'SEN-001' }, pwd: { eligible: false } },
        identifiers: { philHealth: 'PH-123456', govId: 'SSN-789-45-6789' },
        preExistingConditions: [
          { condition: 'Diabetes Type 2', diagnosisDate: new Date(2015, 2, 10), status: 'chronic' }
        ],
        socialHistory: { smoker: 'former', alcohol: 'none', drugs: 'none', notes: 'Quit smoking in 2010' },
        familyHistory: new Map([['diabetes', 'mother'], ['hypertension', 'father']]),
      },
      {
        firstName: 'Michael', lastName: 'Johnson', 
        email: 'michael.j@example.com', phone: '+1-555-0103',
        dateOfBirth: new Date(1990, 8, 10), sex: 'male', civilStatus: 'single',
        nationality: 'US', occupation: 'Software Developer',
        discountEligibility: { senior: { eligible: false }, pwd: { eligible: true, idNumber: 'PWD-001' } },
        preExistingConditions: [
          { condition: 'Asthma', diagnosisDate: new Date(2005, 0, 1), status: 'active' }
        ],
        allergies: [
          { substance: 'Penicillin', reaction: 'Rash', severity: 'moderate' },
          { substance: 'Dust', reaction: 'Sneezing', severity: 'mild' }
        ],
        socialHistory: { smoker: 'never', alcohol: 'social', drugs: 'none' },
      },
      {
        firstName: 'Emily', middleName: 'Rose', lastName: 'Williams', 
        email: 'emily.w@example.com', phone: '+1-555-0104',
        dateOfBirth: new Date(2000, 1, 5), sex: 'female', civilStatus: 'single',
        nationality: 'US', occupation: 'Student',
        discountEligibility: { senior: { eligible: false }, pwd: { eligible: false } },
        contacts: { phone: '+1-555-0104', email: 'emily.w@example.com' },
        immunizations: [
          { name: 'MMR', date: new Date(2001, 0, 1), notes: 'Childhood vaccination' },
          { name: 'Hepatitis B', date: new Date(2001, 0, 1), notes: 'Childhood vaccination' }
        ],
        socialHistory: { smoker: 'never', alcohol: 'none', drugs: 'none' },
      },
      {
        firstName: 'Robert', lastName: 'Brown', 
        email: 'robert.b@example.com', phone: '+1-555-0105',
        dateOfBirth: new Date(1965, 11, 25), sex: 'male', civilStatus: 'married',
        nationality: 'US', occupation: 'Retired',
        discountEligibility: { senior: { eligible: true, idNumber: 'SEN-002' }, pwd: { eligible: false } },
        identifiers: { govId: 'SSN-123-45-6789' },
        preExistingConditions: [
          { condition: 'Arthritis', diagnosisDate: new Date(2010, 5, 1), status: 'chronic' },
          { condition: 'High Cholesterol', diagnosisDate: new Date(2012, 8, 15), status: 'active' }
        ],
        socialHistory: { smoker: 'former', alcohol: 'social', drugs: 'none', notes: 'Quit smoking in 2005' },
        familyHistory: new Map([['heart_disease', 'father'], ['cancer', 'mother']]),
      },
    ];

    for (let i = 0; i < patientsData.length; i++) {
      const pData = patientsData[i];
      const patient = await Patient.create({
        ...pData,
        patientCode: `PAT-${String(i + 1).padStart(4, '0')}`,
        address: {
          street: `${100 + i} Health Street`,
          city: 'Medical City',
          state: 'MC',
          zipCode: `${10000 + i}`,
        },
        emergencyContact: {
          name: `Emergency Contact ${i + 1}`,
          phone: `+1-555-${String(5000 + i).padStart(4, '0')}`,
          relationship: 'Spouse',
        },
        medicalHistory: i === 0 ? 'No significant medical history' : `Patient ${i + 1} medical history`,
        allergies: pData.allergies || (i === 0 ? ['Penicillin'] : []),
        active: true,
      });
      seedData.patients.push(patient);
      console.log(`   ✓ Created patient: ${patient.firstName} ${patient.lastName}`);
    }
    console.log('✅ Patients created\n');

    // 9. Create Services
    console.log('💼 Creating services...');
    const servicesData = [
      { code: 'CONSULT-001', name: 'General Consultation', category: 'consultation', unitPrice: 500, requiresDoctor: true },
      { code: 'CONSULT-002', name: 'Follow-up Consultation', category: 'consultation', unitPrice: 300, requiresDoctor: true },
      { code: 'PROC-001', name: 'Blood Test', category: 'laboratory', unitPrice: 200, requiresDoctor: false },
      { code: 'PROC-002', name: 'X-Ray', category: 'imaging', unitPrice: 800, requiresDoctor: true },
      { code: 'PROC-003', name: 'Ultrasound', category: 'imaging', unitPrice: 1200, requiresDoctor: true },
      { code: 'PROC-004', name: 'ECG', category: 'procedure', unitPrice: 400, requiresDoctor: true },
    ];

    for (const serviceData of servicesData) {
      const service = await Service.create({
        ...serviceData,
        description: `${serviceData.name} service`,
        unit: 'per service',
        duration: serviceData.category === 'consultation' ? 30 : 15,
        active: true,
      });
      seedData.services.push(service);
      console.log(`   ✓ Created service: ${service.name}`);
    }
    console.log('✅ Services created\n');

    // 10. Create Medicines
    console.log('💊 Creating medicines...');
    const medicinesData = [
      { name: 'Paracetamol', genericName: 'Acetaminophen', form: 'tablet', strength: '500 mg', category: 'Analgesic' },
      { name: 'Amoxicillin', genericName: 'Amoxicillin', form: 'capsule', strength: '250 mg', category: 'Antibiotic' },
      { name: 'Ibuprofen', genericName: 'Ibuprofen', form: 'tablet', strength: '400 mg', category: 'NSAID' },
      { name: 'Omeprazole', genericName: 'Omeprazole', form: 'capsule', strength: '20 mg', category: 'PPI' },
      { name: 'Loratadine', genericName: 'Loratadine', form: 'tablet', strength: '10 mg', category: 'Antihistamine' },
    ];

    for (const medData of medicinesData) {
      const medicine = await Medicine.create({
        ...medData,
        unit: 'mg',
        route: 'oral',
        indications: ['Pain relief', 'Fever'],
        standardDosage: medData.strength,
        standardFrequency: 'BID',
        requiresPrescription: true,
        active: true,
      });
      seedData.medicines.push(medicine);
      console.log(`   ✓ Created medicine: ${medicine.name}`);
    }
    console.log('✅ Medicines created\n');

    // 11. Create Inventory Items
    console.log('📦 Creating inventory items...');
    for (let i = 0; i < seedData.medicines.length; i++) {
      const medicine = seedData.medicines[i];
      const inventory = await InventoryItem.create({
        medicineId: medicine._id,
        name: medicine.name,
        category: 'medicine',
        sku: `SKU-${String(i + 1).padStart(6, '0')}`,
        quantity: 100 + (i * 50),
        unit: 'boxes',
        reorderLevel: 20,
        reorderQuantity: 100,
        unitCost: 10 + (i * 5),
        supplier: `Supplier ${i + 1}`,
        expiryDate: new Date(2025, 11, 31),
        location: `Shelf A-${i + 1}`,
        status: 'in-stock',
      });
      seedData.inventory.push(inventory);
      console.log(`   ✓ Created inventory: ${inventory.name}`);
    }
    console.log('✅ Inventory items created\n');

    // 12. Create Rooms
    console.log('🚪 Creating rooms...');
    const roomsData = [
      { name: 'Room 101', roomNumber: '101', floor: 1, roomType: 'consultation' },
      { name: 'Room 102', roomNumber: '102', floor: 1, roomType: 'consultation' },
      { name: 'Examination Room A', roomNumber: '201', floor: 2, roomType: 'examination' },
      { name: 'Procedure Room 1', roomNumber: '301', floor: 3, roomType: 'procedure' },
    ];

    for (const roomData of roomsData) {
      const room = await Room.create({
        ...roomData,
        building: 'Main Building',
        capacity: 4,
        equipment: ['Examination table', 'Stethoscope', 'Blood pressure monitor'],
        amenities: ['Air conditioning', 'WiFi'],
        status: 'available',
        schedule: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isAvailable: true },
        ],
      });
      seedData.rooms.push(room);
      console.log(`   ✓ Created room: ${room.name}`);
    }
    console.log('✅ Rooms created\n');

    // 13. Create Appointments
    console.log('📅 Creating appointments...');
    const today = new Date();
    for (let i = 0; i < seedData.patients.length; i++) {
      const patient = seedData.patients[i];
      const doctor = seedData.doctors[i % seedData.doctors.length];
      const doctorUser = doctorUsers[i % doctorUsers.length];
      const appointmentDate = new Date(today);
      appointmentDate.setDate(today.getDate() + (i + 1));
      appointmentDate.setHours(9 + (i * 2), 0, 0, 0);

      // Use scheduledAt for some appointments, appointmentDate/appointmentTime for others
      const useScheduledAt = i % 2 === 0;
      const scheduledAt = new Date(appointmentDate);
      scheduledAt.setMinutes(0, 0, 0);

      const appointment = await Appointment.create({
        patient: patient._id,
        doctor: doctor._id,
        provider: doctorUser._id, // Also set provider (User reference)
        appointmentCode: `APT-${String(i + 1).padStart(6, '0')}`,
        ...(useScheduledAt ? { scheduledAt } : { 
          appointmentDate: new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate()),
          appointmentTime: `${9 + (i * 2)}:00`
        }),
        duration: 30,
        status: i === 0 ? 'scheduled' : i === 1 ? 'confirmed' : i === 2 ? 'rescheduled' : 'pending',
        isWalkIn: i === 3, // Make one appointment a walk-in
        queueNumber: i === 3 ? i + 1 : undefined,
        estimatedWaitTime: i === 3 ? 15 : undefined,
        reason: i === 3 ? 'Walk-in consultation' : 'General checkup',
        notes: `Appointment for ${patient.firstName} ${patient.lastName}`,
        createdBy: seedData.users[0]._id,
        room: seedData.rooms[i % seedData.rooms.length].name,
      });
      seedData.appointments.push(appointment);
      console.log(`   ✓ Created appointment: ${appointment.appointmentCode}${appointment.isWalkIn ? ' (walk-in)' : ''}`);
    }
    console.log('✅ Appointments created\n');

    // 14. Create Visits
    console.log('🏥 Creating visits...');
    for (let i = 0; i < seedData.patients.length; i++) {
      const patient = seedData.patients[i];
      const doctor = seedData.doctors[i % seedData.doctors.length];
      const doctorUser = doctorUsers[i % doctorUsers.length];
      const visitDate = new Date();
      visitDate.setDate(visitDate.getDate() - (i + 1));

      // Build visit data object - ensure provider is set (required for proper reference)
      const visitData: any = {
        patient: patient._id,
        visitCode: `VISIT-${String(i + 1).padStart(6, '0')}`,
        date: visitDate,
        provider: doctorUser._id, // Visit.provider is optional but should be set for proper reference
        visitType: i === 0 ? 'consultation' : i === 1 ? 'follow-up' : i === 2 ? 'emergency' : i === 3 ? 'teleconsult' : 'checkup',
        chiefComplaint: i === 0 ? 'Routine checkup' : i === 1 ? 'Follow-up for diabetes management' : i === 2 ? 'Chest pain' : 'Annual physical',
        historyOfPresentIllness: i === 0 ? 'Patient presents for routine examination' : i === 1 ? 'Patient returns for diabetes follow-up' : i === 2 ? 'Patient presents with acute chest pain' : 'Patient presents for annual physical examination',
        vitals: {
          bp: `${120 + (i * 5)}/${80 + (i * 2)}`,
          hr: 72 + (i * 2),
          rr: 16 + (i % 2),
          tempC: 36.5 + (i * 0.1),
          spo2: 98 - (i % 2),
          heightCm: 170 + (i * 5),
          weightKg: 70 + (i * 3),
          bmi: 22 + (i * 0.5),
        },
        physicalExam: {
          general: 'Well-appearing',
          heent: 'Normal',
          chest: 'Clear to auscultation',
          cardiovascular: 'Regular rhythm, no murmurs',
          abdomen: 'Soft, non-tender, non-distended',
          neuro: 'Alert and oriented',
          skin: 'No rashes or lesions',
        },
        diagnoses: [
          { code: i === 0 ? 'Z00.00' : i === 1 ? 'E11.9' : i === 2 ? 'R06.02' : 'Z00.00', 
            description: i === 0 ? 'Encounter for general adult medical examination' : i === 1 ? 'Type 2 diabetes mellitus without complications' : i === 2 ? 'Shortness of breath' : 'Encounter for general adult medical examination', 
            primary: true },
        ],
        soapNotes: {
          subjective: i === 0 ? 'Patient reports feeling well' : i === 1 ? 'Patient reports good glucose control, occasional fatigue' : i === 2 ? 'Patient reports sudden onset chest pain and shortness of breath' : 'Patient reports feeling healthy',
          objective: `Vitals: BP ${120 + (i * 5)}/${80 + (i * 2)}, HR ${72 + (i * 2)}, Temp ${36.5 + (i * 0.1)}°C. Physical exam within normal limits.`,
          assessment: i === 0 ? 'Healthy individual, no acute concerns' : i === 1 ? 'Type 2 diabetes, well-controlled' : i === 2 ? 'Acute chest pain, rule out cardiac event' : 'Healthy individual',
          plan: i === 0 ? 'Continue routine care, annual screening' : i === 1 ? 'Continue current medications, monitor glucose levels' : i === 2 ? 'ECG ordered, cardiac enzymes, chest X-ray' : 'Continue routine care',
        },
        treatmentPlan: {
          medications: i > 0 ? [
            { name: 'Metformin', dosage: '500mg', frequency: 'BID', duration: '30 days', instructions: 'Take with meals' }
          ] : [],
          procedures: i === 2 ? [
            { name: 'ECG', description: '12-lead ECG to rule out cardiac event', scheduledDate: visitDate }
          ] : [],
          lifestyle: i === 1 ? [
            { category: 'diet', instructions: 'Follow diabetic diet, limit carbohydrates' },
            { category: 'exercise', instructions: '30 minutes of moderate exercise daily' }
          ] : [],
          followUp: i > 0 ? {
            date: new Date(visitDate.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days later
            instructions: 'Return for follow-up appointment',
            reminderSent: false,
          } : undefined,
        },
        followUpDate: i > 0 ? new Date(visitDate.getTime() + 30 * 24 * 60 * 60 * 1000) : undefined,
        followUpReminderSent: false,
        prescriptions: [],
        labsOrdered: [],
        imagingOrdered: [],
        proceduresPerformed: [],
        status: 'closed',
      };

      // Add digital signature for some visits
      if (i === 0 || i === 1) {
        visitData.digitalSignature = {
          providerName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
          providerId: doctorUser._id,
          signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', // Placeholder base64
          signedAt: visitDate,
          ipAddress: '192.168.1.100',
        };
      }

      const visit = await Visit.create(visitData);
      seedData.visits.push(visit);
      console.log(`   ✓ Created visit: ${visit.visitCode} (${visit.visitType})`);
    }
    console.log('✅ Visits created\n');

    // 15. Create Prescriptions
    console.log('💊 Creating prescriptions...');
    for (let i = 0; i < seedData.visits.length; i++) {
      const visit = seedData.visits[i];
      const patient = seedData.patients[i];
      const medicine = seedData.medicines[i % seedData.medicines.length];
      const doctorUser = doctorUsers[i % doctorUsers.length];

      const prescription = await Prescription.create({
        prescriptionCode: `RX-${String(i + 1).padStart(6, '0')}`,
        visit: visit._id,
        patient: patient._id,
        prescribedBy: doctorUser._id, // Prescription.prescribedBy is optional but should be set
        issuedAt: visit.date,
        medications: [
          {
            medicineId: medicine._id, // Reference to Medicine model
            name: medicine.name,
            genericName: medicine.genericName,
            form: medicine.form,
            strength: medicine.strength,
            dose: medicine.strength,
            route: 'oral',
            frequency: 'BID',
            durationDays: 7,
            quantity: 14,
            instructions: 'Take with food',
          },
        ],
        status: 'active',
        printable: true,
      });

      // Update visit with prescription reference
      await Visit.findByIdAndUpdate(visit._id, {
        $push: { prescriptions: prescription._id },
      });
      seedData.prescriptions.push(prescription);
      console.log(`   ✓ Created prescription: ${prescription.prescriptionCode}`);
    }
    console.log('✅ Prescriptions created\n');

    // 16. Create Lab Results
    console.log('🔬 Creating lab results...');
    for (let i = 0; i < seedData.visits.length; i++) {
      const visit = seedData.visits[i];
      const patient = seedData.patients[i];
      const doctorUser = doctorUsers[i % doctorUsers.length];

      const labResult = await LabResult.create({
        visit: visit._id,
        patient: patient._id,
        orderedBy: doctorUser._id, // LabResult.orderedBy is optional but should be set
        orderDate: visit.date,
        requestCode: `LAB-${String(i + 1).padStart(6, '0')}`,
        request: {
          testType: i % 2 === 0 ? 'CBC' : 'Blood Chemistry',
          testCode: i % 2 === 0 ? 'CBC-001' : 'BC-001',
          description: 'Complete blood count',
          urgency: 'routine',
        },
        results: {
          hb: 13.5 + (i * 0.1),
          wbc: 6.5 + (i * 0.2),
          rbc: 4.5 + (i * 0.1),
        },
        resultDate: new Date(visit.date.getTime() + 24 * 60 * 60 * 1000),
        interpretation: 'Results within normal limits',
        status: 'completed',
        attachments: [],
      });

      // Update visit with lab result reference
      await Visit.findByIdAndUpdate(visit._id, {
        $push: { labsOrdered: labResult._id },
      });
      seedData.labResults.push(labResult);
      console.log(`   ✓ Created lab result: ${labResult.requestCode}`);
    }
    console.log('✅ Lab results created\n');

    // 17. Create Imaging
    console.log('📸 Creating imaging records...');
    for (let i = 0; i < Math.min(3, seedData.visits.length); i++) {
      const visit = seedData.visits[i];
      const patient = seedData.patients[i];
      const doctorUser = doctorUsers[i % doctorUsers.length];

      const imaging = await Imaging.create({
        visit: visit._id,
        patient: patient._id,
        orderedBy: doctorUser._id, // Imaging.orderedBy is optional but should be set
        modality: i === 0 ? 'X-Ray' : i === 1 ? 'Ultrasound' : 'CT',
        bodyPart: i === 0 ? 'Chest' : i === 1 ? 'Abdomen' : 'Head',
        orderDate: visit.date,
        findings: 'No significant findings',
        impression: 'Normal study',
        images: [],
        status: 'completed',
        reportedBy: doctorUser._id, // Imaging.reportedBy is optional but should be set
        reportedAt: new Date(visit.date.getTime() + 2 * 24 * 60 * 60 * 1000),
      });

      // Update visit with imaging reference
      await Visit.findByIdAndUpdate(visit._id, {
        $push: { imagingOrdered: imaging._id },
      });
      seedData.imaging.push(imaging);
      console.log(`   ✓ Created imaging: ${imaging.modality} - ${imaging.bodyPart}`);
    }
    console.log('✅ Imaging records created\n');

    // 18. Create Procedures
    console.log('⚕️ Creating procedures...');
    for (let i = 0; i < Math.min(2, seedData.visits.length); i++) {
      const visit = seedData.visits[i];
      const patient = seedData.patients[i];
      const doctorUser = doctorUsers[i % doctorUsers.length];

      const procedure = await Procedure.create({
        visit: visit._id,
        patient: patient._id,
        type: i === 0 ? 'minor-surgery' : 'wound-care',
        performedBy: doctorUser._id, // Procedure.performedBy is optional but should be set
        date: visit.date,
        details: 'Procedure performed successfully',
        outcome: 'Successful',
        attachments: [],
      });

      // Update visit with procedure reference
      await Visit.findByIdAndUpdate(visit._id, {
        $push: { proceduresPerformed: procedure._id },
      });
      seedData.procedures.push(procedure);
      console.log(`   ✓ Created procedure: ${procedure.type}`);
    }
    console.log('✅ Procedures created\n');

    // 19. Create Invoices
    console.log('💰 Creating invoices...');
    // Get admin user for invoices (user with adminProfile)
    const invoiceAdminUser = seedData.users.find(u => u.adminProfile);
    if (!invoiceAdminUser) {
      throw new Error('Admin user not found. Cannot create invoices.');
    }

    for (let i = 0; i < seedData.visits.length; i++) {
      const visit = seedData.visits[i];
      const patient = seedData.patients[i];
      const service = seedData.services[i % seedData.services.length];

      const subtotal = service.unitPrice;
      const discounts: any[] = [];
      if (patient.discountEligibility?.senior?.eligible) {
        discounts.push({
          type: 'senior',
          percentage: 20,
          amount: subtotal * 0.2,
          appliedBy: invoiceAdminUser._id,
        });
      }
      if (patient.discountEligibility?.pwd?.eligible) {
        discounts.push({
          type: 'pwd',
          percentage: 20,
          amount: subtotal * 0.2,
          appliedBy: invoiceAdminUser._id,
        });
      }
      if (patient.discountEligibility?.membership?.eligible) {
        discounts.push({
          type: 'membership',
          percentage: patient.discountEligibility.membership.discountPercentage || 10,
          amount: subtotal * ((patient.discountEligibility.membership.discountPercentage || 10) / 100),
          appliedBy: invoiceAdminUser._id,
        });
      }
      const discountAmount = discounts.reduce((sum, d) => sum + d.amount, 0);
      const tax = (subtotal - discountAmount) * 0.12; // 12% tax
      const total = subtotal - discountAmount + tax;

      // Add insurance for some invoices
      const hasInsurance = i === 1 || i === 2;
      const insurance = hasInsurance ? {
        provider: i === 1 ? 'BlueCross BlueShield' : 'Aetna',
        policyNumber: `POL-${String(1000 + i).padStart(6, '0')}`,
        memberId: `MEM-${String(2000 + i).padStart(6, '0')}`,
        coverageType: 'partial' as const,
        coverageAmount: total * 0.8,
        claimNumber: `CLAIM-${String(i + 1).padStart(6, '0')}`,
        status: i === 1 ? 'approved' as const : 'pending' as const,
        notes: 'Insurance claim submitted',
      } : undefined;

      const paymentMethods: Array<'cash' | 'gcash' | 'bank_transfer' | 'card' | 'check' | 'insurance' | 'hmo' | 'other'> = 
        ['cash', 'gcash', 'card', 'bank_transfer', 'insurance'];
      const paymentMethod = paymentMethods[i % paymentMethods.length];

      const invoice = await Invoice.create({
        patient: patient._id,
        visit: visit._id,
        invoiceNumber: `INV-${String(i + 1).padStart(6, '0')}`,
        items: [
          {
            serviceId: service._id,
            code: service.code,
            description: service.name,
            category: service.category,
            quantity: 1,
            unitPrice: service.unitPrice,
            total: service.unitPrice,
          },
        ],
        subtotal: subtotal,
        discounts: discounts,
        tax: tax,
        total: total,
        totalPaid: i < 2 ? total : total * 0.5,
        outstandingBalance: i < 2 ? 0 : total * 0.5,
        status: i < 2 ? 'paid' : 'partial',
        insurance: insurance,
        createdBy: invoiceAdminUser._id,
        payments: i < 2 ? [
          {
            method: paymentMethod,
            amount: total,
            date: visit.date,
            receiptNo: paymentMethod === 'cash' ? `RCP-${String(i + 1).padStart(6, '0')}` : undefined,
            referenceNo: paymentMethod === 'gcash' || paymentMethod === 'bank_transfer' ? `REF-${String(i + 1).padStart(6, '0')}` : undefined,
            processedBy: invoiceAdminUser._id,
            notes: paymentMethod === 'insurance' ? 'Insurance payment processed' : undefined,
          },
        ] : [],
      });
      seedData.invoices.push(invoice);
      console.log(`   ✓ Created invoice: ${invoice.invoiceNumber} (${invoice.status}, ${paymentMethod})`);
    }
    console.log('✅ Invoices created\n');

    // 20. Create Documents
    console.log('📄 Creating documents...');
    // Use the admin user for uploading documents
    const documentUploader = seedData.users.find(u => u.adminProfile) || seedData.users[0];
    for (let i = 0; i < seedData.visits.length; i++) {
      const visit = seedData.visits[i];
      const patient = seedData.patients[i];

      const document = await Document.create({
        documentCode: `DOC-${String(i + 1).padStart(6, '0')}`,
        title: `Visit Summary - ${visit.visitCode}`,
        description: 'Visit summary document',
        category: 'other',
        documentType: 'pdf',
        filename: `visit-summary-${visit.visitCode}.pdf`,
        originalFilename: `visit-summary-${visit.visitCode}.pdf`,
        contentType: 'application/pdf',
        size: 1024 * 50, // 50KB
        url: 'https://example.com/documents/sample.pdf',
        patient: patient._id,
        visit: visit._id,
        uploadedBy: documentUploader._id,
        status: 'active',
      });
      seedData.documents.push(document);
      console.log(`   ✓ Created document: ${document.title}`);
    }
    console.log('✅ Documents created\n');

    // 21. Create Referrals
    console.log('🔄 Creating referrals...');
    for (let i = 0; i < Math.min(3, seedData.patients.length); i++) {
      const patient = seedData.patients[i];
      const referringDoctor = seedData.doctors[i % seedData.doctors.length];
      const receivingDoctor = seedData.doctors[(i + 1) % seedData.doctors.length];
      const visit = i < seedData.visits.length ? seedData.visits[i] : null;
      const appointment = i < seedData.appointments.length ? seedData.appointments[i] : null;

      const referralTypes: Array<'doctor_to_doctor' | 'patient_to_patient' | 'external'> = 
        ['doctor_to_doctor', 'doctor_to_doctor', 'external'];
      const referralType = referralTypes[i];
      const urgencies: Array<'routine' | 'urgent' | 'stat'> = ['routine', 'urgent', 'stat'];
      const urgency = urgencies[i];
      const statuses: Array<'pending' | 'accepted' | 'completed' | 'declined' | 'cancelled'> = 
        ['pending', 'accepted', 'completed'];
      const status = statuses[i];

      const referredDate = new Date();
      referredDate.setDate(referredDate.getDate() - (i + 1));
      const acceptedDate = status === 'accepted' || status === 'completed' ? new Date(referredDate.getTime() + 24 * 60 * 60 * 1000) : undefined;
      const completedDate = status === 'completed' ? new Date(acceptedDate!.getTime() + 7 * 24 * 60 * 60 * 1000) : undefined;

      const referral = await Referral.create({
        referralCode: `REF-${String(i + 1).padStart(6, '0')}`,
        type: referralType,
        referringDoctor: referralType === 'doctor_to_doctor' ? referringDoctor._id : undefined,
        receivingDoctor: referralType === 'doctor_to_doctor' ? receivingDoctor._id : undefined,
        referringClinic: referralType === 'external' ? 'External Medical Center' : undefined,
        referringContact: referralType === 'external' ? {
          name: 'Dr. External Referrer',
          phone: '+1-555-9999',
          email: 'external@clinic.com',
        } : undefined,
        patient: patient._id,
        reason: i === 0 ? 'Specialist consultation required for cardiac evaluation' : i === 1 ? 'Urgent specialist review needed' : 'External referral for advanced imaging',
        urgency: urgency,
        specialty: i === 0 ? 'Cardiology' : i === 1 ? 'Neurology' : 'Radiology',
        notes: i === 0 ? 'Patient has history of chest pain, needs cardiac workup' : i === 1 ? 'Urgent neurological assessment required' : 'External imaging facility referral',
        chiefComplaint: i === 0 ? 'Chest pain and shortness of breath' : i === 1 ? 'Severe headaches' : 'Advanced imaging required',
        diagnosis: i === 0 ? 'Rule out cardiac event' : i === 1 ? 'Possible migraine, rule out other causes' : 'Imaging referral',
        relevantHistory: i === 0 ? 'Patient has hypertension, family history of heart disease' : i === 1 ? 'Patient reports recurrent headaches for 3 months' : 'Previous imaging inconclusive',
        medications: i === 0 ? ['Metformin', 'Lisinopril'] : i === 1 ? ['Ibuprofen'] : [],
        attachments: i > 0 ? [
          {
            filename: `referral-doc-${i + 1}.pdf`,
            url: `https://example.com/documents/referral-${i + 1}.pdf`,
            uploadDate: referredDate,
          }
        ] : [],
        status: status,
        referredDate: referredDate,
        acceptedDate: acceptedDate,
        completedDate: completedDate,
        visit: visit?._id,
        appointment: appointment?._id,
        followUpRequired: true,
        followUpDate: new Date(referredDate.getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days later
        followUpNotes: status === 'completed' ? 'Follow-up consultation completed successfully' : 'Follow-up appointment scheduled',
        feedback: status === 'completed' ? {
          rating: 5,
          comments: 'Excellent referral process, timely and professional',
          submittedBy: doctorUsers[i % doctorUsers.length]._id,
          submittedAt: completedDate!,
        } : undefined,
      });
      seedData.referrals.push(referral);
      console.log(`   ✓ Created referral: ${referral.referralCode} (${referral.type}, ${referral.status})`);
    }
    console.log('✅ Referrals created\n');

    // 22. Create Queue Entries
    console.log('📋 Creating queue entries...');
    for (let i = 0; i < seedData.appointments.length; i++) {
      const appointment = seedData.appointments[i];
      const patient = seedData.patients[i];
      const doctor = seedData.doctors[i % seedData.doctors.length];
      const room = seedData.rooms[i % seedData.rooms.length];
      const visit = i < seedData.visits.length ? seedData.visits[i] : null;

      const queuedAt = new Date();
      queuedAt.setHours(9 + i, 0, 0, 0);
      const checkedInAt = i > 0 ? new Date(queuedAt.getTime() + 5 * 60 * 1000) : undefined; // 5 minutes after queued
      const calledAt = i === 1 ? new Date(checkedInAt!.getTime() + 10 * 60 * 1000) : undefined; // 10 minutes after check-in
      const startedAt = i === 1 ? new Date(calledAt!.getTime() + 2 * 60 * 1000) : undefined; // 2 minutes after called
      const completedAt = i === 2 ? new Date(startedAt ? startedAt.getTime() + 20 * 60 * 1000 : queuedAt.getTime() + 30 * 60 * 1000) : undefined;

      const checkInMethods: Array<'manual' | 'qr_code' | 'kiosk'> = ['manual', 'qr_code', 'kiosk'];
      const checkInMethod = i > 0 ? checkInMethods[i % checkInMethods.length] : undefined;

      const queue = await Queue.create({
        queueType: appointment.isWalkIn ? 'walk-in' : 'appointment',
        patient: patient._id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        appointment: appointment._id,
        visit: visit?._id, // Link to visit if exists
        doctor: doctor._id,
        room: room._id,
        status: i === 0 ? 'waiting' : i === 1 ? 'in-progress' : i === 2 ? 'completed' : 'waiting',
        priority: i,
        estimatedWaitTime: 15 + (i * 5),
        queuedAt: queuedAt,
        calledAt: calledAt,
        startedAt: startedAt,
        completedAt: completedAt,
        checkedIn: i > 0,
        checkedInAt: checkedInAt,
        checkInMethod: checkInMethod,
        qrCode: checkInMethod === 'qr_code' ? `QR-${patient.patientCode}-${Date.now()}` : undefined,
        notes: i === 1 ? 'Patient called, consultation in progress' : undefined,
      });
      seedData.queues.push(queue);
      console.log(`   ✓ Created queue entry: ${queue.queueNumber} (${queue.queueType}, ${queue.status})`);
    }
    console.log('✅ Queue entries created\n');

    // 23. Create Memberships
    console.log('🎟️ Creating memberships...');
    for (let i = 0; i < Math.min(3, seedData.patients.length); i++) {
      const patient = seedData.patients[i];
      // Note: Membership model has a pre-save hook that automatically sets discountPercentage
      // based on tier, so we don't need to set it explicitly
      const membership = await Membership.create({
        patient: patient._id,
        membershipNumber: `MEM-${String(i + 1).padStart(6, '0')}`,
        tier: i === 0 ? 'bronze' : i === 1 ? 'silver' : 'gold',
        status: 'active',
        points: 100 + (i * 50),
        totalPointsEarned: 200 + (i * 100),
        totalPointsRedeemed: 50 + (i * 25),
        joinDate: new Date(2023, 0, 1),
        expiryDate: new Date(2024, 11, 31),
      });
      seedData.memberships.push(membership);

      // Update patient with membership eligibility
      // discountPercentage is set by the Membership model's pre-save hook
      await Patient.findByIdAndUpdate(patient._id, {
        'discountEligibility.membership': {
          eligible: true,
          membershipType: membership.tier,
          membershipNumber: membership.membershipNumber,
          expiryDate: membership.expiryDate,
          discountPercentage: membership.discountPercentage, // Retrieved after save (set by pre-save hook)
        },
      });
      console.log(`   ✓ Created membership: ${membership.membershipNumber} (${membership.tier} tier, ${membership.discountPercentage}% discount)`);
    }
    console.log('✅ Memberships created\n');

    // 24. Create Notifications
    console.log('🔔 Creating notifications...');
    for (const user of seedData.users) {
      const notification = await Notification.create({
        user: user._id,
        type: 'system',
        priority: 'normal',
        title: 'Welcome to Clinic Management System',
        message: 'Your account has been set up successfully',
        read: false,
      });
      console.log(`   ✓ Created notification for: ${user.name}`);
    }
    console.log('✅ Notifications created\n');

    // 25. Create Settings (if not exists)
    console.log('⚙️ Checking settings...');
    const existingSettings = await Settings.findOne();
    if (!existingSettings) {
      await Settings.create({
        clinicName: 'Sample Clinic',
        clinicAddress: '123 Medical Street, Health City, HC 12345',
        clinicPhone: '+1-555-0000',
        clinicEmail: 'info@clinic.com',
        clinicWebsite: 'https://clinic.com',
        taxId: 'TAX-123456',
        licenseNumber: 'LIC-789012',
      });
      console.log('   ✓ Created default settings');
    } else {
      console.log('   ✓ Settings already exist');
    }
    console.log('✅ Settings checked\n');

    // 26. Create Audit Logs (sample entries)
    console.log('📝 Creating audit log entries...');
    const adminUser = seedData.users.find(u => u.adminProfile);
    if (adminUser) {
      const auditActions = [
        { action: 'login', resource: 'system', description: 'Admin user logged in' },
        { action: 'create', resource: 'patient', description: 'Created new patient record' },
        { action: 'update', resource: 'appointment', description: 'Updated appointment status' },
        { action: 'read', resource: 'invoice', description: 'Viewed invoice details' },
      ];
      
      for (const auditData of auditActions) {
        const auditLog = await AuditLog.create({
          userId: adminUser._id,
          userEmail: adminUser.email,
          userRole: 'admin',
          action: auditData.action,
          resource: auditData.resource,
          description: auditData.description,
          success: true,
          timestamp: new Date(),
          ipAddress: '127.0.0.1',
          requestMethod: auditData.action === 'login' ? 'POST' : 'GET',
          requestPath: `/${auditData.resource}`,
        });
        seedData.auditLogs.push(auditLog);
      }
      console.log(`   ✓ Created ${seedData.auditLogs.length} audit log entries`);
    }
    console.log('✅ Audit logs created\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Seed data generation completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nSummary:');
    console.log('   --- Authentication & Authorization ---');
    console.log(`   Roles: ${seedData.roles.length}`);
    console.log(`   Users: ${seedData.users.length}`);
    console.log('   --- Staff Profiles ---');
    console.log(`   Admins: ${seedData.admins.length}`);
    console.log(`   Doctors: ${seedData.doctors.length}`);
    console.log(`   Nurses: ${seedData.nurses.length}`);
    console.log(`   Receptionists: ${seedData.receptionists.length}`);
    console.log(`   Accountants: ${seedData.accountants.length}`);
    console.log(`   Medical Reps: ${seedData.medicalRepresentatives.length}`);
    console.log('   --- Patients & Clinical ---');
    console.log(`   Patients: ${seedData.patients.length}`);
    console.log(`   Appointments: ${seedData.appointments.length}`);
    console.log(`   Visits: ${seedData.visits.length}`);
    console.log(`   Prescriptions: ${seedData.prescriptions.length}`);
    console.log(`   Lab Results: ${seedData.labResults.length}`);
    console.log(`   Imaging: ${seedData.imaging.length}`);
    console.log(`   Procedures: ${seedData.procedures.length}`);
    console.log('   --- Billing & Membership ---');
    console.log(`   Invoices: ${seedData.invoices.length}`);
    console.log(`   Memberships: ${seedData.memberships.length}`);
    console.log('   --- Catalog & Inventory ---');
    console.log(`   Services: ${seedData.services.length}`);
    console.log(`   Medicines: ${seedData.medicines.length}`);
    console.log(`   Inventory Items: ${seedData.inventory.length}`);
    console.log(`   Rooms: ${seedData.rooms.length}`);
    console.log('   --- Queue & Documents ---');
    console.log(`   Queue Entries: ${seedData.queues.length}`);
    console.log(`   Documents: ${seedData.documents.length}`);
    console.log(`   Referrals: ${seedData.referrals.length}`);
    console.log('   --- Audit & Notifications ---');
    console.log(`   Audit Logs: ${seedData.auditLogs.length}`);
    console.log(`   Notifications: ${seedData.users.length}`);
    console.log('\n✅ All collection references are properly linked!\n');
    
    console.log('Default login credentials:');
    console.log('   (Passwords are auto-generated by profile models - check console output above)');
    console.log('   Admin: admin@clinic.com');
    console.log('   Doctors: doctor1@clinic.com, doctor2@clinic.com');
    console.log('   Nurses: nurse1@clinic.com, nurse2@clinic.com');
    console.log('   Receptionist: receptionist@clinic.com');
    console.log('   Accountant: accountant@clinic.com');
    console.log('   Med Reps: medrep1@pharma.com, medrep2@biotech.com\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error seeding data:', error.message);
    console.error(error.stack);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Run the script
seedDataScript();

