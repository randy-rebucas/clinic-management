# Staff & Doctor Management System

This document describes the Staff & Doctor Management features implemented in the clinic management system.

## Features Overview

### 1. User Roles & Permissions

The system supports five distinct user roles with role-based access control:

#### Roles:

1. **Admin**
   - Full system access
   - Can manage all users and settings
   - Can view all reports and data
   - Can create, update, and delete any record

2. **Doctor**
   - Access to patient records, visits, prescriptions
   - Can create and update clinical notes
   - Can view lab results and create lab requests
   - Can view appointments
   - Can view invoices (read-only)
   - Can view productivity reports for themselves

3. **Nurse**
   - Access to patient records (read/write/update)
   - Can create and update visits
   - Can view and update lab results
   - Can manage appointments (read/write/update)
   - Can view prescriptions (read-only)
   - Can view invoices (read-only)

4. **Receptionist**
   - Access to patient records (read/write/update)
   - Full appointment management (create, update, delete)
   - Can view visits (read-only)
   - Can manage invoices (read/write/update)
   - Can view doctors (read-only)

5. **Accountant**
   - Access to invoices (read/write/update)
   - Can view patients (read-only)
   - Can view appointments (read-only)
   - Can view financial reports
   - Can view all doctor productivity reports

#### Permissions System:

- **Default Permissions**: Each role has predefined permissions
- **Custom Permissions**: Users can have custom permissions for fine-grained control
- **Permission Checking**: Utility functions to check permissions programmatically

**Permission Structure:**
```typescript
{
  resource: string,  // e.g., 'patients', 'appointments', 'billing'
  actions: string[]   // e.g., ['read', 'write', 'delete']
}
```

**Permission Utility Functions:**
- `hasPermission(role, resource, action)` - Check if role has permission
- `canAccess(role, resource)` - Check read access
- `canModify(role, resource)` - Check write/update access
- `canDelete(role, resource)` - Check delete access

### 2. Doctor Schedules

The system provides comprehensive doctor schedule management:

#### Schedule Features:
- **Weekly Schedule**: Define working hours for each day of the week
- **Availability Overrides**: Override schedule for specific dates
- **Status Tracking**: Track doctor status (active, inactive, on-leave)
- **Schedule API**: Get and update doctor schedules

#### Schedule Structure:
```typescript
schedule: [{
  dayOfWeek: number,      // 0 = Sunday, 1 = Monday, etc.
  startTime: string,      // HH:mm format
  endTime: string,        // HH:mm format
  isAvailable: boolean    // Can temporarily disable
}]

availabilityOverrides: [{
  date: Date,
  isAvailable: boolean,
  startTime?: string,
  endTime?: string,
  reason?: string
}]
```

**API Endpoints:**
- `GET /api/doctors/[id]/schedule` - Get doctor schedule (with optional date range)
- `PUT /api/doctors/[id]/schedule` - Update doctor schedule (admin or doctor only)

### 3. Productivity Reports (Per Doctor)

The system generates comprehensive productivity reports for doctors:

#### Report Metrics:

**Appointment Metrics:**
- Total appointments
- Completed appointments
- Cancelled appointments
- No-show appointments
- Scheduled appointments
- Completion rate
- No-show rate
- Average appointments per day

**Visit Metrics:**
- Total visits
- Completed visits
- Open visits
- Visit type breakdown

**Prescription Metrics:**
- Total prescriptions
- Active prescriptions
- Dispensed prescriptions
- Prescription status breakdown

**Revenue Metrics:**
- Total revenue
- Total billed
- Outstanding revenue
- Revenue per visit

**Time-Based Metrics:**
- Daily averages (if date range provided)
- Period summary

**API Endpoints:**
- `GET /api/doctors/[id]/productivity` - Get productivity report for specific doctor
- `GET /api/doctors/productivity` - Get productivity reports for all doctors (admin/accountant only)

**Query Parameters:**
- `startDate` - Start date for report period (optional)
- `endDate` - End date for report period (optional)

## User Model Enhancements

The User model has been enhanced with:

```typescript
{
  name: string,
  email: string,
  password: string,
  role: 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant',
  staffInfo: {
    employeeId: string,
    department: string,
    position: string,
    hireDate: Date,
    phone: string,
    address: string,
    emergencyContact: {
      name: string,
      phone: string,
      relationship: string
    }
  },
  permissions: [{
    resource: string,
    actions: string[]
  }],
  doctorProfile: ObjectId,  // Link to Doctor model if role is doctor
  status: 'active' | 'inactive' | 'suspended',
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints

### Staff Management
- `GET /api/staff` - List all staff (admin only)
  - Query params: `role`, `status`, `department`
- `POST /api/staff` - Create new staff member (admin only)
- `GET /api/staff/[id]` - Get staff member details
- `PUT /api/staff/[id]` - Update staff member
- `DELETE /api/staff/[id]` - Deactivate staff member (admin only)

### Doctor Schedules
- `GET /api/doctors/[id]/schedule` - Get doctor schedule
  - Query params: `startDate`, `endDate`
- `PUT /api/doctors/[id]/schedule` - Update doctor schedule (admin or doctor)

### Productivity Reports
- `GET /api/doctors/[id]/productivity` - Get doctor productivity report
  - Query params: `startDate`, `endDate`
- `GET /api/doctors/productivity` - Get all doctors' productivity (admin/accountant only)
  - Query params: `startDate`, `endDate`

## Usage Examples

### Creating a Staff Member

```javascript
POST /api/staff
{
  "name": "Jane Nurse",
  "email": "jane.nurse@clinic.com",
  "password": "securepassword123",
  "role": "nurse",
  "staffInfo": {
    "employeeId": "EMP-001",
    "department": "Clinical",
    "position": "Registered Nurse",
    "hireDate": "2024-01-15",
    "phone": "+1234567890",
    "address": "123 Main St, City, State 12345",
    "emergencyContact": {
      "name": "John Doe",
      "phone": "+1234567891",
      "relationship": "Spouse"
    }
  }
}
```

### Updating Doctor Schedule

```javascript
PUT /api/doctors/[id]/schedule
{
  "schedule": [
    {
      "dayOfWeek": 1,  // Monday
      "startTime": "09:00",
      "endTime": "17:00",
      "isAvailable": true
    },
    {
      "dayOfWeek": 2,  // Tuesday
      "startTime": "09:00",
      "endTime": "17:00",
      "isAvailable": true
    }
  ],
  "availabilityOverrides": [
    {
      "date": "2024-12-25",
      "isAvailable": false,
      "reason": "Holiday"
    }
  ]
}
```

### Getting Productivity Report

```javascript
GET /api/doctors/[id]/productivity?startDate=2024-01-01&endDate=2024-01-31

Response:
{
  "success": true,
  "data": {
    "doctor": {
      "_id": "...",
      "name": "Dr. John Smith",
      "specialization": "Cardiology"
    },
    "period": {
      "startDate": "2024-01-01",
      "endDate": "2024-01-31",
      "days": 31
    },
    "summary": {
      "totalAppointments": 150,
      "completedAppointments": 140,
      "cancelledAppointments": 5,
      "noShowAppointments": 5,
      "totalVisits": 140,
      "totalPrescriptions": 120,
      "totalRevenue": 50000
    },
    "metrics": {
      "completionRate": 93.33,
      "noShowRate": 3.33,
      "avgAppointmentsPerDay": 4.84,
      "revenuePerVisit": 357.14
    },
    "breakdowns": {
      "appointmentStatus": {...},
      "visitType": {...},
      "prescriptionStatus": {...}
    }
  }
}
```

## Permission Checking

### In API Routes

```typescript
import { verifySession } from '@/app/lib/dal';
import { hasPermission } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission
  const canRead = await hasPermission(session, 'patients', 'read');
  if (!canRead) {
    return forbiddenResponse('No permission to read patients');
  }

  // Proceed with request
}
```

### In Server Components

```typescript
import { requireRole } from '@/app/lib/auth-helpers';

export default async function PatientsPage() {
  // Require nurse, doctor, or admin role
  const session = await requireRole(['admin', 'doctor', 'nurse']);
  
  // User is authenticated and has required role
  // Render page
}
```

## Role Permissions Matrix

| Resource | Admin | Doctor | Nurse | Receptionist | Accountant |
|----------|-------|--------|-------|--------------|------------|
| Patients | All | Read/Write/Update | Read/Write/Update | Read/Write/Update | Read |
| Visits | All | All | Read/Write/Update | Read | - |
| Prescriptions | All | Read/Write/Update | Read | - | - |
| Lab Results | All | Read/Write/Update | Read/Write/Update | - | - |
| Appointments | All | Read/Write/Update | Read/Write/Update | All | Read |
| Invoices | All | Read | Read | Read/Write/Update | Read/Write/Update |
| Reports | All | Read (own) | - | - | Read |
| Staff | All | - | - | - | - |
| Settings | All | - | - | - | - |

## Future Enhancements

- Role-based UI components (show/hide based on permissions)
- Permission templates for common roles
- Audit logging for permission changes
- Time-based permissions (e.g., temporary access)
- Department-based permissions
- Shift scheduling for nurses and receptionists
- Staff performance reviews
- Doctor availability calendar view
- Automated schedule conflict detection
- Integration with payroll systems

