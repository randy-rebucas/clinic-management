# Doctor & Staff Management Guide

Complete guide for managing doctors, nurses, receptionists, accountants, and other clinic staff in MyClinicSoft.

---

## Table of Contents

1. [Overview](#overview)
2. [Doctor Management](#doctor-management)
3. [Staff Management](#staff-management)
4. [Schedule & Availability](#schedule--availability)
5. [Performance Tracking](#performance-tracking)
6. [User Account Integration](#user-account-integration)
7. [API Reference](#api-reference)
8. [UI Components](#ui-components)
9. [Best Practices](#best-practices)

---

## Overview

MyClinicSoft supports comprehensive staff management with:
- **Doctor profiles** with specializations, schedules, and performance metrics
- **Staff types**: Nurses, Receptionists, Accountants
- **Schedule management** with availability overrides
- **Performance tracking** and metrics
- **Multi-tenant support** with per-tenant staff isolation
- **User account integration** for authentication and access control

### Staff Hierarchy

```
Admin (Level 100)
  ├── Doctor (Level 80)
  ├── Nurse (Level 60)
  ├── Receptionist (Level 40)
  └── Accountant (Level 30)
```

---

## Doctor Management

### Doctor Model

**File**: `models/Doctor.ts`

```typescript
interface IDoctor {
  // Identification
  tenantId?: ObjectId;              // Multi-tenant support
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  
  // Professional Info
  specializationId: ObjectId;       // → Specialization
  licenseNumber: string;            // PRC license
  title?: string;                   // "Dr.", "Prof.", etc.
  qualifications?: string[];        // ["MD", "FPCP", "Diplomate"]
  department?: string;
  bio?: string;
  
  // Schedule
  schedule: Array<{
    dayOfWeek: number;              // 0=Sunday, 1=Monday, etc.
    startTime: string;              // "09:00"
    endTime: string;                // "17:00"
    isAvailable: boolean;
  }>;
  
  // Availability Overrides
  availabilityOverrides?: Array<{
    date: Date;
    isAvailable: boolean;
    startTime?: string;
    endTime?: string;
    reason?: string;                // "On leave", "Conference"
  }>;
  
  // Internal Notes
  internalNotes?: Array<{
    note: string;
    createdBy: ObjectId;
    createdAt: Date;
    isImportant?: boolean;
  }>;
  
  // Performance Metrics
  performanceMetrics?: {
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    averageRating?: number;
    lastUpdated: Date;
  };
  
  // Status
  status: 'active' | 'inactive' | 'on-leave';
  
  createdAt: Date;
  updatedAt: Date;
}
```

### Creating a Doctor

**API Endpoint**: `POST /api/doctors`

```typescript
const createDoctor = async (doctorData) => {
  const response = await fetch('/api/doctors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      firstName: 'Juan',
      lastName: 'Cruz',
      email: 'dr.cruz@clinic.com',
      phone: '+639123456789',
      specialization: 'Internal Medicine',  // Auto-creates if not exists
      // OR specializationId: '64spec123...',
      licenseNumber: 'PRC-12345678',
      title: 'Dr.',
      qualifications: ['MD', 'FPCP'],
      department: 'Internal Medicine',
      bio: 'Board-certified internist with 15 years experience',
      schedule: [
        {
          dayOfWeek: 1,           // Monday
          startTime: '09:00',
          endTime: '17:00',
          isAvailable: true
        },
        {
          dayOfWeek: 3,           // Wednesday
          startTime: '09:00',
          endTime: '17:00',
          isAvailable: true
        },
        {
          dayOfWeek: 5,           // Friday
          startTime: '09:00',
          endTime: '13:00',
          isAvailable: true
        }
      ],
      status: 'active'
    })
  });
  
  const { success, data, error } = await response.json();
  return data;
};
```

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "64doc123...",
    "firstName": "Juan",
    "lastName": "Cruz",
    "email": "dr.cruz@clinic.com",
    "specializationId": {
      "_id": "64spec123...",
      "name": "Internal Medicine",
      "category": "Specialty"
    },
    "licenseNumber": "PRC-12345678",
    "schedule": [...],
    "status": "active"
  }
}
```

### Listing Doctors

**API Endpoint**: `GET /api/doctors`

```typescript
const getDoctors = async () => {
  const response = await fetch('/api/doctors', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const { success, data } = await response.json();
  return data; // Array of doctors
};
```

### Updating a Doctor

**API Endpoint**: `PUT /api/doctors/:id`

```typescript
const updateDoctor = async (doctorId, updates) => {
  const response = await fetch(`/api/doctors/${doctorId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });
  
  return await response.json();
};

// Example: Update schedule
await updateDoctor('64doc123...', {
  schedule: [
    {
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '16:00',
      isAvailable: true
    }
  ]
});

// Example: Add availability override (vacation)
await updateDoctor('64doc123...', {
  availabilityOverrides: [
    {
      date: new Date('2024-03-15'),
      isAvailable: false,
      reason: 'On vacation'
    }
  ]
});
```

### Deleting a Doctor

**API Endpoint**: `DELETE /api/doctors/:id`

```typescript
const deleteDoctor = async (doctorId) => {
  const response = await fetch(`/api/doctors/${doctorId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
};
```

**Note**: Soft delete - sets `status: 'inactive'`, preserves data for historical records.

---

## Staff Management

### Staff Types

MyClinicSoft supports three staff types:

1. **Nurse**: Clinical support staff
2. **Receptionist**: Front desk, appointments, check-in
3. **Accountant**: Billing, invoices, payments

Each type has its own model (`Nurse`, `Receptionist`, `Accountant`) with similar structure.

### Nurse Model

**File**: `models/Nurse.ts`

```typescript
interface INurse {
  // Identification
  tenantId?: ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  
  // Nurse-specific
  employeeId?: string;
  licenseNumber?: string;          // Nursing license
  department?: string;
  specialization?: string;         // 'Pediatrics', 'Emergency', 'ICU'
  hireDate?: Date;
  address?: string;
  
  // Schedule
  schedule?: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>;
  
  // Availability Overrides
  availabilityOverrides?: Array<{
    date: Date;
    isAvailable: boolean;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }>;
  
  // Emergency Contact
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  
  // Internal Notes
  internalNotes?: Array<{
    note: string;
    createdBy: ObjectId;
    createdAt: Date;
    isImportant?: boolean;
  }>;
  
  // Performance Metrics
  performanceMetrics?: {
    totalVisits: number;
    completedVisits: number;
    cancelledVisits: number;
    lastUpdated: Date;
  };
  
  // Profile
  title?: string;                  // 'RN', 'LPN'
  qualifications?: string[];
  bio?: string;
  status: 'active' | 'inactive' | 'on-leave';
  
  createdAt: Date;
  updatedAt: Date;
}
```

### Creating Staff

**API Endpoint**: `POST /api/staff`

```typescript
const createStaff = async (staffData) => {
  const response = await fetch('/api/staff', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      type: 'nurse',                    // 'nurse', 'receptionist', 'accountant'
      firstName: 'Maria',
      lastName: 'Santos',
      email: 'maria.santos@clinic.com',
      phone: '+639123456789',
      employeeId: 'EMP-001',
      licenseNumber: 'RN-12345',        // For nurses
      department: 'Pediatrics',
      specialization: 'Pediatric Nursing', // For nurses
      hireDate: new Date('2020-01-15'),
      address: '123 Health St, Manila',
      emergencyContact: {
        name: 'Juan Santos',
        phone: '+639987654321',
        relationship: 'Spouse'
      },
      schedule: [
        {
          dayOfWeek: 1,                 // Monday
          startTime: '08:00',
          endTime: '16:00',
          isAvailable: true
        },
        {
          dayOfWeek: 2,                 // Tuesday
          startTime: '08:00',
          endTime: '16:00',
          isAvailable: true
        }
      ],
      title: 'RN',
      qualifications: ['BSN', 'ACLS Certified'],
      status: 'active'
    })
  });
  
  return await response.json();
};
```

### Listing Staff

**API Endpoint**: `GET /api/staff`

**Query Parameters**:
- `type`: Filter by type (`nurse`, `receptionist`, `accountant`, `all`)
- `status`: Filter by status (`active`, `inactive`, `on-leave`)
- `search`: Search by name, email, employeeId
- `page`: Page number (default: 1)
- `limit`: Per page (default: 20)

```typescript
const getStaff = async (filters) => {
  const params = new URLSearchParams({
    type: filters.type || 'all',
    status: filters.status || 'active',
    page: filters.page || 1,
    limit: filters.limit || 20
  });
  
  if (filters.search) {
    params.append('search', filters.search);
  }
  
  const response = await fetch(`/api/staff?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
};

// Example: Get all nurses
const nurses = await getStaff({ type: 'nurse' });

// Example: Search staff
const results = await getStaff({ search: 'maria' });
```

**Response**:
```json
{
  "staff": [
    {
      "_id": "64n123...",
      "staffType": "nurse",
      "firstName": "Maria",
      "lastName": "Santos",
      "email": "maria.santos@clinic.com",
      "employeeId": "EMP-001",
      "department": "Pediatrics",
      "status": "active"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  },
  "counts": {
    "nurses": 20,
    "receptionists": 15,
    "accountants": 10
  }
}
```

### Updating Staff

**API Endpoint**: `PUT /api/staff/:id`

```typescript
const updateStaff = async (staffId, updates) => {
  const response = await fetch(`/api/staff/${staffId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });
  
  return await response.json();
};

// Example: Update contact info
await updateStaff('64n123...', {
  phone: '+639191234567',
  address: '456 New St, Manila'
});

// Example: Mark as on-leave
await updateStaff('64n123...', {
  status: 'on-leave',
  availabilityOverrides: [
    {
      date: new Date('2024-03-01'),
      isAvailable: false,
      reason: 'Maternity leave'
    }
  ]
});
```

---

## Schedule & Availability

### Regular Schedule

Define weekly recurring schedule:

```typescript
const schedule = [
  // Monday-Friday, 8AM-5PM
  { dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true },
  { dayOfWeek: 2, startTime: '08:00', endTime: '17:00', isAvailable: true },
  { dayOfWeek: 3, startTime: '08:00', endTime: '17:00', isAvailable: true },
  { dayOfWeek: 4, startTime: '08:00', endTime: '17:00', isAvailable: true },
  { dayOfWeek: 5, startTime: '08:00', endTime: '17:00', isAvailable: true },
  
  // Weekend off
  { dayOfWeek: 0, startTime: '00:00', endTime: '00:00', isAvailable: false },
  { dayOfWeek: 6, startTime: '00:00', endTime: '00:00', isAvailable: false },
];
```

**Day of Week Mapping**:
- 0 = Sunday
- 1 = Monday
- 2 = Tuesday
- 3 = Wednesday
- 4 = Thursday
- 5 = Friday
- 6 = Saturday

### Availability Overrides

Override regular schedule for specific dates:

```typescript
const availabilityOverrides = [
  // Vacation
  {
    date: new Date('2024-03-15'),
    isAvailable: false,
    reason: 'Vacation'
  },
  
  // Extended hours for special date
  {
    date: new Date('2024-03-20'),
    isAvailable: true,
    startTime: '07:00',
    endTime: '20:00',
    reason: 'Extended clinic hours'
  },
  
  // Half day
  {
    date: new Date('2024-03-22'),
    isAvailable: true,
    startTime: '08:00',
    endTime: '12:00',
    reason: 'Conference in afternoon'
  }
];
```

### Checking Availability

**Helper Function**:

```typescript
const isAvailable = (doctor: IDoctor, date: Date, time: string): boolean => {
  // Check overrides first
  const override = doctor.availabilityOverrides?.find(
    o => o.date.toDateString() === date.toDateString()
  );
  
  if (override) {
    if (!override.isAvailable) return false;
    
    // Check time range
    if (override.startTime && override.endTime) {
      return time >= override.startTime && time <= override.endTime;
    }
    return true;
  }
  
  // Check regular schedule
  const dayOfWeek = date.getDay();
  const scheduleEntry = doctor.schedule.find(s => s.dayOfWeek === dayOfWeek);
  
  if (!scheduleEntry || !scheduleEntry.isAvailable) return false;
  
  return time >= scheduleEntry.startTime && time <= scheduleEntry.endTime;
};

// Usage
const doctor = await Doctor.findById('64doc123...');
const isAvailableNow = isAvailable(doctor, new Date('2024-03-15'), '10:00');
```

---

## Performance Tracking

### Doctor Performance Metrics

**Automatically tracked**:
- Total appointments
- Completed appointments
- Cancelled appointments
- No-show appointments
- Average rating (if review system enabled)

**Update Metrics** (after appointment completion):

```typescript
const updateDoctorMetrics = async (doctorId: string, appointmentStatus: string) => {
  const doctor = await Doctor.findById(doctorId);
  
  if (!doctor.performanceMetrics) {
    doctor.performanceMetrics = {
      totalAppointments: 0,
      completedAppointments: 0,
      cancelledAppointments: 0,
      noShowAppointments: 0,
      lastUpdated: new Date()
    };
  }
  
  doctor.performanceMetrics.totalAppointments += 1;
  
  if (appointmentStatus === 'completed') {
    doctor.performanceMetrics.completedAppointments += 1;
  } else if (appointmentStatus === 'cancelled') {
    doctor.performanceMetrics.cancelledAppointments += 1;
  } else if (appointmentStatus === 'no-show') {
    doctor.performanceMetrics.noShowAppointments += 1;
  }
  
  doctor.performanceMetrics.lastUpdated = new Date();
  await doctor.save();
};
```

### Staff Performance Metrics

**Nurse Metrics**:
- Total visits assisted
- Completed visits
- Cancelled visits

**Receptionist Metrics** (tracked via AuditLog):
- Patients registered
- Appointments scheduled
- Check-ins processed

**Query Performance**:

```typescript
const getStaffPerformance = async (staffId: string, startDate: Date, endDate: Date) => {
  // For nurses
  const nurse = await Nurse.findById(staffId);
  const visits = await Visit.find({
    nurse: staffId,
    date: { $gte: startDate, $lte: endDate }
  });
  
  return {
    totalVisits: visits.length,
    completedVisits: visits.filter(v => v.status === 'completed').length,
    averagePerDay: visits.length / daysBetween(startDate, endDate)
  };
};
```

---

## User Account Integration

### Linking Staff to User Accounts

Each staff member can have a user account for system access:

```typescript
// 1. Create staff profile
const doctor = await Doctor.create({
  firstName: 'Juan',
  lastName: 'Cruz',
  email: 'dr.cruz@clinic.com',
  // ... other fields
});

// 2. Create user account
const user = await User.create({
  email: 'dr.cruz@clinic.com',
  password: hashedPassword,
  name: 'Dr. Juan Cruz',
  role: 'doctor',                    // Links to Role model
  doctorProfile: doctor._id,         // Link to Doctor profile
  tenantId: tenantId,
  status: 'active'
});

// 3. Link back (optional)
doctor.userId = user._id;
await doctor.save();
```

### User Model Relationships

```typescript
interface IUser {
  tenantId: ObjectId;
  email: string;
  password: string;
  name: string;
  role: ObjectId;                    // → Role
  
  // Profile links (one of these)
  doctorProfile?: ObjectId;          // → Doctor
  nurseProfile?: ObjectId;           // → Nurse
  receptionistProfile?: ObjectId;    // → Receptionist
  accountantProfile?: ObjectId;      // → Accountant
  adminProfile?: ObjectId;           // → Admin
  
  status: 'active' | 'inactive' | 'suspended';
  lastLogin?: Date;
}
```

### Creating Staff with User Account

**Combined Creation**:

```typescript
const createStaffWithAccount = async (staffData, password) => {
  // 1. Create staff profile
  const response = await fetch('/api/staff', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(staffData)
  });
  
  const { data: staffProfile } = await response.json();
  
  // 2. Create user account
  const userResponse = await fetch('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      email: staffData.email,
      password: password,
      name: `${staffData.firstName} ${staffData.lastName}`,
      role: staffData.type,          // 'nurse', 'receptionist', 'accountant'
      [`${staffData.type}Profile`]: staffProfile._id
    })
  });
  
  return await userResponse.json();
};
```

---

## API Reference

### Doctors API

| Endpoint | Method | Description | Access |
|----------|--------|-------------|--------|
| `/api/doctors` | GET | List all doctors | Doctor, Nurse, Receptionist |
| `/api/doctors` | POST | Create doctor | Admin |
| `/api/doctors/:id` | GET | Get doctor details | Doctor, Nurse, Receptionist |
| `/api/doctors/:id` | PUT | Update doctor | Admin, Doctor (own) |
| `/api/doctors/:id` | DELETE | Delete doctor (soft) | Admin |

### Staff API

| Endpoint | Method | Description | Access |
|----------|--------|-------------|--------|
| `/api/staff` | GET | List staff (all types) | Admin, Doctor |
| `/api/staff` | POST | Create staff | Admin |
| `/api/staff/:id` | GET | Get staff details | Admin, Doctor |
| `/api/staff/:id` | PUT | Update staff | Admin, Staff (own) |
| `/api/staff/:id` | DELETE | Delete staff (soft) | Admin |

### Specializations API

| Endpoint | Method | Description | Access |
|----------|--------|-------------|--------|
| `/api/specializations` | GET | List specializations | All authenticated |
| `/api/specializations` | POST | Create specialization | Admin |
| `/api/specializations/:id` | PUT | Update specialization | Admin |
| `/api/specializations/:id` | DELETE | Delete specialization | Admin |

---

## UI Components

### DoctorsPageClient

**File**: `components/DoctorsPageClient.tsx`

Features:
- List all doctors with search and filters
- View doctor details
- Edit doctor profiles
- Manage schedules
- View performance metrics

**Usage**:
```tsx
// app/doctors/page.tsx
import DoctorsPageClient from '@/components/DoctorsPageClient';

export default function DoctorsPage() {
  return <DoctorsPageClient />;
}
```

### DoctorDetailClient

**File**: `components/DoctorDetailClient.tsx`

Features:
- Full doctor profile
- Schedule calendar view
- Availability management
- Performance dashboard
- Internal notes
- Edit capabilities

**Usage**:
```tsx
// app/doctors/[id]/page.tsx
import DoctorDetailClient from '@/components/DoctorDetailClient';

export default function DoctorDetail({ params }: { params: { id: string } }) {
  return <DoctorDetailClient doctorId={params.id} />;
}
```

### Staff Management UI

- List view with filtering by type
- Create/Edit forms
- Schedule management
- Performance tracking
- User account linking

---

## Best Practices

### 1. Schedule Management

✅ **Do**:
- Set realistic working hours
- Use availability overrides for exceptions
- Update schedules in advance
- Communicate changes to receptionists

❌ **Don't**:
- Create overlapping schedules
- Forget to mark holidays
- Change schedules without notice

### 2. Staff Creation

✅ **Do**:
- Collect all required information
- Verify license numbers
- Set up proper emergency contacts
- Link to user accounts
- Assign correct roles and permissions

❌ **Don't**:
- Use duplicate emails
- Skip verification steps
- Ignore license expiry dates

### 3. Performance Tracking

✅ **Do**:
- Review metrics regularly
- Use data for scheduling optimization
- Identify training needs
- Recognize high performers

❌ **Don't**:
- Use metrics alone for performance evaluation
- Ignore contextual factors
- Compare across different specializations

### 4. Multi-Tenant Considerations

✅ **Do**:
- Always filter by tenantId
- Prevent cross-tenant access
- Validate tenant permissions
- Isolate staff data

❌ **Don't**:
- Share staff across tenants (without proper relationship)
- Allow cross-tenant queries
- Expose staff data globally

### 5. Data Security

✅ **Do**:
- Protect sensitive staff data
- Encrypt license numbers
- Limit access to internal notes
- Audit staff data changes
- Use RBAC for staff management

❌ **Don't**:
- Expose staff contact info to patients
- Store passwords in plain text
- Allow unauthorized edits
- Share emergency contact info publicly

### 6. Schedule Optimization

```typescript
// Good: Check availability before scheduling
const availableSlots = await getAvailableSlots(doctorId, date);

// Good: Consider doctor workload
const appointments = await Appointment.find({
  doctor: doctorId,
  appointmentDate: date
});
const workload = appointments.length;

// Good: Implement buffer times
const BUFFER_TIME = 5; // minutes between appointments
```

### 7. Validation

```typescript
// Validate schedule times
const validateSchedule = (schedule) => {
  for (const entry of schedule) {
    if (entry.startTime >= entry.endTime) {
      throw new Error('Start time must be before end time');
    }
    
    if (entry.isAvailable && (!entry.startTime || !entry.endTime)) {
      throw new Error('Available days must have start and end times');
    }
  }
};

// Validate license numbers (PRC format)
const validateLicenseNumber = (licenseNumber: string) => {
  const prcPattern = /^PRC-\d{8}$/;
  return prcPattern.test(licenseNumber);
};
```

---

## Common Workflows

### 1. Onboarding New Doctor

```typescript
// Step 1: Create doctor profile
const doctor = await createDoctor({
  firstName: 'Juan',
  lastName: 'Cruz',
  email: 'dr.cruz@clinic.com',
  phone: '+639123456789',
  specialization: 'Internal Medicine',
  licenseNumber: 'PRC-12345678',
  schedule: weekdaySchedule,
  status: 'active'
});

// Step 2: Create user account
const user = await createUser({
  email: 'dr.cruz@clinic.com',
  password: tempPassword,
  role: 'doctor',
  doctorProfile: doctor._id
});

// Step 3: Send welcome email
await sendWelcomeEmail(doctor.email, tempPassword);
```

### 2. Managing Doctor Leave

```typescript
// Add availability override for leave period
await updateDoctor(doctorId, {
  availabilityOverrides: [
    {
      date: new Date('2024-03-15'),
      isAvailable: false,
      reason: 'Medical leave'
    },
    {
      date: new Date('2024-03-16'),
      isAvailable: false,
      reason: 'Medical leave'
    }
  ]
});

// Notify receptionists
await createNotification({
  type: 'doctor-unavailable',
  message: `Dr. Cruz is on leave Mar 15-16`,
  recipients: receptionistIds
});

// Reschedule affected appointments
const affected = await Appointment.find({
  doctor: doctorId,
  appointmentDate: { $gte: '2024-03-15', $lte: '2024-03-16' }
});

for (const appointment of affected) {
  await rescheduleAppointment(appointment._id);
}
```

### 3. Staff Performance Review

```typescript
// Generate monthly report
const report = await generateStaffReport({
  staffId: nurseId,
  startDate: new Date('2024-02-01'),
  endDate: new Date('2024-02-29')
});

// Report includes:
// - Total visits assisted
// - Patient satisfaction
// - Punctuality metrics
// - Tasks completed
// - Areas for improvement
```

---

**Last Updated**: February 14, 2026  
**Version**: 1.0.0
