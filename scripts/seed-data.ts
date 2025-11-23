import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Import all models
import User from '../models/User';
import Role from '../models/Role';
import Permission from '../models/Permission';
import { DEFAULT_ROLE_PERMISSIONS } from '../lib/permissions';
import Staff from '../models/Staff';
import Doctor from '../models/Doctor';
import Patient from '../models/Patient';
import Service from '../models/Service';
import Medicine from '../models/Medicine';
import InventoryItem from '../models/Inventory';
import Room from '../models/Room';
import Appointment from '../models/Appointment';
import Visit from '../models/Visit';
import Prescription from '../models/Prescription';
import LabResult from '../models/LabResult';
import Imaging from '../models/Imaging';
import Procedure from '../models/Procedure';
import Invoice from '../models/Invoice';
import Document from '../models/Document';
import Referral from '../models/Referral';
import Queue from '../models/Queue';
import Notification from '../models/Notification';
import Membership from '../models/Membership';
import Settings from '../models/Settings';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

// Store created IDs for references
const seedData: {
  roles: any[];
  users: any[];
  staff: any[];
  doctors: any[];
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
} = {
  roles: [],
  users: [],
  staff: [],
  doctors: [],
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
      Notification.deleteMany({}),
      Queue.deleteMany({}),
      Referral.deleteMany({}),
      Document.deleteMany({}),
      Invoice.deleteMany({}),
      Procedure.deleteMany({}),
      Imaging.deleteMany({}),
      LabResult.deleteMany({}),
      Prescription.deleteMany({}),
      Visit.deleteMany({}),
      Appointment.deleteMany({}),
      Membership.deleteMany({}),
      InventoryItem.deleteMany({}),
      Medicine.deleteMany({}),
      Service.deleteMany({}),
      Room.deleteMany({}),
      Patient.deleteMany({}),
      Doctor.deleteMany({}),
      Staff.deleteMany({}),
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

    console.log('✅ Roles created\n');

    // 2. Create Users
    console.log('👤 Creating users...');
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    
    const usersData = [
      { name: 'Admin User', email: 'admin@clinic.com', role: 'admin' },
      { name: 'Dr. John Smith', email: 'doctor1@clinic.com', role: 'doctor' },
      { name: 'Dr. Sarah Johnson', email: 'doctor2@clinic.com', role: 'doctor' },
      { name: 'Nurse Mary', email: 'nurse1@clinic.com', role: 'nurse' },
      { name: 'Nurse James', email: 'nurse2@clinic.com', role: 'nurse' },
      { name: 'Receptionist Alice', email: 'receptionist@clinic.com', role: 'receptionist' },
      { name: 'Accountant Bob', email: 'accountant@clinic.com', role: 'accountant' },
    ];

    for (const userData of usersData) {
      const role = seedData.roles.find(r => r.name === userData.role);
      const user = await User.create({
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
        role: role!._id,
        status: 'active',
      });
      seedData.users.push(user);
      console.log(`   ✓ Created user: ${user.name} (${user.email})`);
    }
    console.log('✅ Users created\n');

    // Store doctor users for later use
    const doctorUsers = seedData.users.filter(u => 
      seedData.roles.find(r => r._id.toString() === u.role.toString())?.name === 'doctor'
    );

    // 3. Create Staff
    console.log('👔 Creating staff records...');
    const staffUsers = seedData.users.filter(u => 
      ['nurse', 'receptionist', 'accountant'].includes(
        seedData.roles.find(r => r._id.toString() === u.role.toString())?.name || ''
      )
    );

    for (let i = 0; i < staffUsers.length; i++) {
      const user = staffUsers[i];
      const role = seedData.roles.find(r => r._id.toString() === user.role.toString());
      const staff = await Staff.create({
        user: user._id,
        employeeId: `EMP-${String(i + 1).padStart(4, '0')}`,
        department: role?.name === 'nurse' ? 'Nursing' : role?.name === 'receptionist' ? 'Reception' : 'Finance',
        position: role?.displayName || 'Staff',
        hireDate: new Date(2023, 0, 1),
        phone: `+1-555-${String(1000 + i).padStart(4, '0')}`,
        address: `${100 + i} Main Street, City, State 12345`,
        emergencyContact: {
          name: `Emergency Contact ${i + 1}`,
          phone: `+1-555-${String(2000 + i).padStart(4, '0')}`,
          relationship: 'Spouse',
        },
      });
      seedData.staff.push(staff);
      
      // Update user with staff reference
      await User.findByIdAndUpdate(user._id, { staffInfo: staff._id });
      console.log(`   ✓ Created staff: ${user.name}`);
    }
    console.log('✅ Staff records created\n');

    // 4. Create Doctors
    console.log('🩺 Creating doctors...');
    const specializations = ['General Medicine', 'Cardiology', 'Pediatrics', 'Dermatology'];
    
    for (let i = 0; i < doctorUsers.length; i++) {
      const user = doctorUsers[i];
      const doctor = await Doctor.create({
        firstName: user.name.split(' ')[1] || 'Doctor',
        lastName: user.name.split(' ')[2] || user.name.split(' ')[1] || 'Smith',
        email: user.email,
        phone: `+1-555-${String(3000 + i).padStart(4, '0')}`,
        specialization: specializations[i] || 'General Medicine',
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
        bio: `Experienced ${specializations[i] || 'General Medicine'} specialist`,
        department: specializations[i] || 'General Medicine',
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
      
      // Update user with doctor profile reference
      await User.findByIdAndUpdate(user._id, { doctorProfile: doctor._id });
      console.log(`   ✓ Created doctor: ${doctor.firstName} ${doctor.lastName}`);
    }
    console.log('✅ Doctors created\n');

    // 5. Create Patients
    console.log('🏥 Creating patients...');
    const patientsData = [
      {
        firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '+1-555-0101',
        dateOfBirth: new Date(1985, 5, 15), sex: 'male',
        discountEligibility: { senior: { eligible: false }, pwd: { eligible: false } },
      },
      {
        firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@example.com', phone: '+1-555-0102',
        dateOfBirth: new Date(1970, 3, 20), sex: 'female',
        discountEligibility: { senior: { eligible: true, idNumber: 'SEN-001' }, pwd: { eligible: false } },
      },
      {
        firstName: 'Michael', lastName: 'Johnson', email: 'michael.j@example.com', phone: '+1-555-0103',
        dateOfBirth: new Date(1990, 8, 10), sex: 'male',
        discountEligibility: { senior: { eligible: false }, pwd: { eligible: true, idNumber: 'PWD-001' } },
      },
      {
        firstName: 'Emily', lastName: 'Williams', email: 'emily.w@example.com', phone: '+1-555-0104',
        dateOfBirth: new Date(2000, 1, 5), sex: 'female',
        discountEligibility: { senior: { eligible: false }, pwd: { eligible: false } },
      },
      {
        firstName: 'Robert', lastName: 'Brown', email: 'robert.b@example.com', phone: '+1-555-0105',
        dateOfBirth: new Date(1965, 11, 25), sex: 'male',
        discountEligibility: { senior: { eligible: true, idNumber: 'SEN-002' }, pwd: { eligible: false } },
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
        medicalHistory: 'No significant medical history',
        allergies: ['Penicillin'],
        active: true,
      });
      seedData.patients.push(patient);
      console.log(`   ✓ Created patient: ${patient.firstName} ${patient.lastName}`);
    }
    console.log('✅ Patients created\n');

    // 6. Create Services
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

    // 7. Create Medicines
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

    // 8. Create Inventory Items
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

    // 9. Create Rooms
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

    // 10. Create Appointments
    console.log('📅 Creating appointments...');
    const today = new Date();
    for (let i = 0; i < seedData.patients.length; i++) {
      const patient = seedData.patients[i];
      const doctor = seedData.doctors[i % seedData.doctors.length];
      const appointmentDate = new Date(today);
      appointmentDate.setDate(today.getDate() + (i + 1));
      appointmentDate.setHours(9 + (i * 2), 0, 0, 0);

      const appointment = await Appointment.create({
        patient: patient._id,
        doctor: doctor._id,
        appointmentCode: `APT-${String(i + 1).padStart(6, '0')}`,
        appointmentDate: appointmentDate,
        appointmentTime: `${9 + (i * 2)}:00`,
        scheduledAt: appointmentDate,
        duration: 30,
        status: i === 0 ? 'scheduled' : i === 1 ? 'confirmed' : 'pending',
        reason: 'General checkup',
        notes: `Appointment for ${patient.firstName} ${patient.lastName}`,
        createdBy: seedData.users[0]._id,
        room: seedData.rooms[i % seedData.rooms.length].name,
      });
      seedData.appointments.push(appointment);
      console.log(`   ✓ Created appointment: ${appointment.appointmentCode}`);
    }
    console.log('✅ Appointments created\n');

    // 11. Create Visits
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
        visitType: i === 0 ? 'consultation' : i === 1 ? 'follow-up' : 'checkup',
        chiefComplaint: 'Routine checkup',
        historyOfPresentIllness: 'Patient presents for routine examination',
        vitals: {
          bp: '120/80',
          hr: 72 + (i * 2),
          rr: 16,
          tempC: 36.5 + (i * 0.1),
          spo2: 98,
          heightCm: 170 + (i * 5),
          weightKg: 70 + (i * 3),
          bmi: 22 + (i * 0.5),
        },
        physicalExam: {
          general: 'Well-appearing',
          cardiovascular: 'Regular rhythm',
          abdomen: 'Soft, non-tender',
        },
        diagnoses: [
          { code: 'Z00.00', description: 'Encounter for general adult medical examination', primary: true },
        ],
        soapNotes: {
          subjective: 'Patient reports feeling well',
          objective: 'Vitals within normal limits',
          assessment: 'Healthy individual',
          plan: 'Continue routine care',
        },
        prescriptions: [],
        labsOrdered: [],
        imagingOrdered: [],
        proceduresPerformed: [],
        status: 'closed',
      };

      const visit = await Visit.create(visitData);
      seedData.visits.push(visit);
      console.log(`   ✓ Created visit: ${visit.visitCode}`);
    }
    console.log('✅ Visits created\n');

    // 12. Create Prescriptions
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

    // 13. Create Lab Results
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

    // 14. Create Imaging
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

    // 15. Create Procedures
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

    // 16. Create Invoices
    console.log('💰 Creating invoices...');
    // Get admin user (first user is admin based on seed data)
    const adminUser = seedData.users.find(u => 
      seedData.roles.find(r => r._id.toString() === u.role.toString())?.name === 'admin'
    );
    if (!adminUser) {
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
          appliedBy: adminUser._id, // Invoice.discounts[].appliedBy is optional but set for proper reference
        });
      }
      const discountAmount = discounts.reduce((sum, d) => sum + d.amount, 0);
      const total = subtotal - discountAmount;

      const invoice = await Invoice.create({
        patient: patient._id,
        visit: visit._id,
        invoiceNumber: `INV-${String(i + 1).padStart(6, '0')}`,
        items: [
          {
            serviceId: service._id, // Reference to Service model
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
        total: total,
        totalPaid: i < 2 ? total : total * 0.5,
        outstandingBalance: i < 2 ? 0 : total * 0.5,
        status: i < 2 ? 'paid' : 'partial',
        createdBy: adminUser._id, // Invoice.createdBy is optional but set for proper reference
        payments: i < 2 ? [
          {
            method: 'cash',
            amount: total,
            date: visit.date,
            processedBy: adminUser._id, // Invoice.payments[].processedBy is optional but set for proper reference
          },
        ] : [],
      });
      seedData.invoices.push(invoice);
      console.log(`   ✓ Created invoice: ${invoice.invoiceNumber}`);
    }
    console.log('✅ Invoices created\n');

    // 17. Create Documents
    console.log('📄 Creating documents...');
    for (let i = 0; i < seedData.visits.length; i++) {
      const visit = seedData.visits[i];
      const patient = seedData.patients[i];
      const adminUser = seedData.users[0];

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
        uploadedBy: adminUser._id,
        status: 'active',
      });
      seedData.documents.push(document);
      console.log(`   ✓ Created document: ${document.title}`);
    }
    console.log('✅ Documents created\n');

    // 18. Create Referrals
    console.log('🔄 Creating referrals...');
    for (let i = 0; i < Math.min(2, seedData.patients.length); i++) {
      const patient = seedData.patients[i];
      const referringDoctor = seedData.doctors[i];
      const receivingDoctor = seedData.doctors[(i + 1) % seedData.doctors.length];

      const referral = await Referral.create({
        referralCode: `REF-${String(i + 1).padStart(6, '0')}`,
        type: 'doctor_to_doctor',
        referringDoctor: referringDoctor._id,
        receivingDoctor: receivingDoctor._id,
        patient: patient._id,
        reason: 'Specialist consultation required',
        urgency: 'routine',
        specialty: 'Cardiology',
        status: 'pending',
        referredDate: new Date(),
        followUpRequired: true,
      });
      seedData.referrals.push(referral);
      console.log(`   ✓ Created referral: ${referral.referralCode}`);
    }
    console.log('✅ Referrals created\n');

    // 19. Create Queue Entries
    console.log('📋 Creating queue entries...');
    for (let i = 0; i < seedData.appointments.length; i++) {
      const appointment = seedData.appointments[i];
      const patient = seedData.patients[i];
      const doctor = seedData.doctors[i % seedData.doctors.length];
      const room = seedData.rooms[i % seedData.rooms.length];

      const queue = await Queue.create({
        queueType: 'appointment',
        patient: patient._id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        appointment: appointment._id,
        doctor: doctor._id,
        room: room._id, // Queue.room is ObjectId reference to Room
        status: i === 0 ? 'waiting' : i === 1 ? 'in-progress' : 'completed',
        priority: i,
        estimatedWaitTime: 15 + (i * 5),
        queuedAt: new Date(),
        checkedIn: i > 0,
        checkedInAt: i > 0 ? new Date() : undefined,
      });
      seedData.queues.push(queue);
      console.log(`   ✓ Created queue entry: ${queue.queueNumber}`);
    }
    console.log('✅ Queue entries created\n');

    // 20. Create Memberships
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

    // 21. Create Notifications
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

    // 22. Create Settings (if not exists)
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

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Seed data generation completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nSummary:');
    console.log(`   Roles: ${seedData.roles.length}`);
    console.log(`   Users: ${seedData.users.length}`);
    console.log(`   Staff: ${seedData.staff.length}`);
    console.log(`   Doctors: ${seedData.doctors.length}`);
    console.log(`   Patients: ${seedData.patients.length}`);
    console.log(`   Services: ${seedData.services.length}`);
    console.log(`   Medicines: ${seedData.medicines.length}`);
    console.log(`   Inventory Items: ${seedData.inventory.length}`);
    console.log(`   Rooms: ${seedData.rooms.length}`);
    console.log(`   Appointments: ${seedData.appointments.length}`);
    console.log(`   Visits: ${seedData.visits.length}`);
    console.log(`   Prescriptions: ${seedData.prescriptions.length}`);
    console.log(`   Lab Results: ${seedData.labResults.length}`);
    console.log(`   Imaging: ${seedData.imaging.length}`);
    console.log(`   Procedures: ${seedData.procedures.length}`);
    console.log(`   Invoices: ${seedData.invoices.length}`);
    console.log(`   Documents: ${seedData.documents.length}`);
    console.log(`   Referrals: ${Math.min(2, seedData.patients.length)}`);
    console.log(`   Queue Entries: ${seedData.queues.length}`);
    console.log(`   Memberships: ${Math.min(3, seedData.patients.length)}`);
    console.log('\n✅ All collection references are properly linked!\n');

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

