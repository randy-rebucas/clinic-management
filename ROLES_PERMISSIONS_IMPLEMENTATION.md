# Roles and Permissions Implementation

## Overview

This document describes the comprehensive Roles and Permissions system that has been implemented across the clinic management application. The system uses database-backed Role and Permission models with a fallback to default role-based permissions.

## Architecture

### Models

1. **Role Model** (`models/Role.ts`)
   - Stores role definitions (admin, doctor, nurse, receptionist, accountant)
   - Contains default permissions for each role
   - Supports role hierarchy via `level` field
   - Can have custom permissions via `permissions` array

2. **Permission Model** (`models/Permission.ts`)
   - Links users and roles to resources and actions
   - Supports both user-specific and role-based permissions
   - Resource-based access control (e.g., 'patients', 'appointments')

3. **User Model** (`models/User.ts`)
   - References a Role via ObjectId
   - Can have custom permissions array
   - Links to Staff model for additional staff information

4. **Staff Model** (`models/Staff.ts`)
   - One-to-one relationship with User
   - Stores employee-specific information

### Permission System

The permission system (`lib/permissions.ts`) provides:

- **Default Role Permissions**: Pre-defined permissions for each role
- **Database Permission Lookup**: Checks user's role permissions and custom permissions
- **Fast Role-Based Checks**: Uses default permissions for quick checks
- **Full Database Checks**: Falls back to database for custom permissions

### Default Permissions

| Role | Resources | Actions |
|------|-----------|---------|
| **admin** | * | * (full access) |
| **doctor** | patients, visits, prescriptions, lab-results, appointments, invoices (read), doctors (read), reports (read), queue, referrals | read, write, update, delete (varies by resource) |
| **nurse** | patients, visits, prescriptions (read), lab-results, appointments, invoices (read), doctors (read), queue | read, write, update |
| **receptionist** | patients, appointments, visits (read), invoices, doctors (read), queue | read, write, update, delete (appointments) |
| **accountant** | patients (read), invoices, appointments (read), reports (read) | read, write, update |

## Implementation Details

### Session Management

Sessions now include:
- `userId`: User's ObjectId
- `email`: User's email
- `role`: Role name (for backward compatibility)
- `roleId`: Role ObjectId (new)

### Authentication Flow

1. **Login/Signup** (`app/actions/auth.ts`)
   - Loads role from database
   - Creates session with role name and roleId
   - Automatically creates default roles if they don't exist

2. **Session Verification** (`app/lib/dal.ts`)
   - Verifies session and checks expiration
   - Returns session payload with role information

### Permission Checking

#### For API Routes

```typescript
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read resource
  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) {
    return permissionCheck; // Returns 403 Forbidden if no permission
  }

  // Your route logic here
}
```

#### For Pages

```typescript
import { requirePagePermission } from '@/app/lib/auth-helpers';

export default async function PatientsPage() {
  // Require permission to read patients
  await requirePagePermission('patients', 'read');

  return <PatientsPageClient />;
}
```

## Updated Files

### Core System Files

1. **`lib/permissions.ts`** - Complete rewrite
   - Database-backed permission checking
   - Default role permissions as fallback
   - Fast role-based checks and full database checks

2. **`app/lib/dal.ts`** - Enhanced
   - Session payload includes `roleId`
   - `createSession()` accepts optional `roleId`
   - `getUser()` populates role information

3. **`app/actions/auth.ts`** - Updated
   - Loads role from database on login/signup
   - Creates default roles if they don't exist
   - Sets roleId in session

4. **`app/lib/auth-helpers.ts`** - Enhanced
   - `requirePermission()` - For API routes
   - `requirePagePermission()` - For pages
   - `hasPermission()` - Uses database + defaults

### API Routes Updated

The following API routes now have permission checks:

- ✅ `app/api/patients/route.ts` - GET, POST
- ✅ `app/api/patients/[id]/route.ts` - GET, PUT, DELETE
- ✅ `app/api/appointments/route.ts` - GET, POST
- ✅ `app/api/appointments/[id]/route.ts` - GET, PUT, DELETE
- ✅ `app/api/visits/route.ts` - GET, POST
- ✅ `app/api/visits/[id]/route.ts` - GET, PUT, DELETE
- ✅ `app/api/prescriptions/route.ts` - GET, POST
- ✅ `app/api/invoices/route.ts` - GET, POST
- ✅ `app/api/lab-results/route.ts` - GET, POST
- ✅ `app/api/queue/route.ts` - GET
- ✅ `app/api/referrals/route.ts` - GET, POST
- ✅ `app/api/doctors/route.ts` - GET, POST
- ✅ `app/api/reports/dashboard/route.ts` - GET

### Pages Updated

The following pages now have permission checks:

- ✅ `app/patients/page.tsx`
- ✅ `app/appointments/page.tsx`
- ✅ `app/visits/page.tsx`
- ✅ `app/prescriptions/page.tsx`
- ✅ `app/invoices/page.tsx`
- ✅ `app/lab-results/page.tsx`
- ✅ `app/reports/page.tsx`
- ✅ `app/queue/page.tsx`

## Remaining Work

### API Routes to Update

The following API routes still need permission checks added (follow the pattern above):

- `app/api/prescriptions/[id]/route.ts` - PUT, DELETE
- `app/api/invoices/[id]/route.ts` - GET, PUT, DELETE
- `app/api/lab-results/[id]/route.ts` - GET, PUT, DELETE
- `app/api/queue/[id]/route.ts` - GET, PUT, DELETE
- `app/api/referrals/[id]/route.ts` - GET, PUT, DELETE
- `app/api/doctors/[id]/route.ts` - GET, PUT, DELETE
- Other specialized routes (documents, inventory, medicines, etc.)

### Pages to Update

- `app/doctors/page.tsx`
- `app/referrals/page.tsx`
- `app/documents/page.tsx`
- `app/inventory/page.tsx`
- Other pages as needed

## Usage Examples

### Adding Permission Check to New API Route

```typescript
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  // Check permission
  const permissionCheck = await requirePermission(session, 'resource-name', 'read');
  if (permissionCheck) return permissionCheck;

  // Your code here
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  // Check permission
  const permissionCheck = await requirePermission(session, 'resource-name', 'write');
  if (permissionCheck) return permissionCheck;

  // Your code here
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  // Check permission
  const permissionCheck = await requirePermission(session, 'resource-name', 'update');
  if (permissionCheck) return permissionCheck;

  // Your code here
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  // Check permission
  const permissionCheck = await requirePermission(session, 'resource-name', 'delete');
  if (permissionCheck) return permissionCheck;

  // Your code here
}
```

### Adding Permission Check to New Page

```typescript
import { requirePagePermission } from '@/app/lib/auth-helpers';
import YourPageClient from '@/components/YourPageClient';

export default async function YourPage() {
  // Require permission to read the resource
  await requirePagePermission('resource-name', 'read');

  return <YourPageClient />;
}
```

## Resource Names

Use these resource names when checking permissions:

- `patients` - Patient management
- `appointments` - Appointment scheduling
- `visits` - Patient visits
- `prescriptions` - Prescription management
- `lab-results` - Laboratory results
- `invoices` - Billing and invoices
- `doctors` - Doctor management
- `reports` - Reports and analytics
- `queue` - Queue management
- `referrals` - Referral management
- `documents` - Document management
- `inventory` - Inventory management
- `medicines` - Medicine management
- `settings` - System settings (admin only)

## Actions

Standard actions used in the system:

- `read` - View/list resources
- `write` - Create new resources
- `update` - Modify existing resources
- `delete` - Remove resources

## Custom Permissions

To grant custom permissions to a user:

1. Create a Permission document:
```typescript
const permission = await Permission.create({
  user: userId,
  resource: 'patients',
  actions: ['read', 'write', 'update']
});
```

2. Add to user's permissions array:
```typescript
await User.findByIdAndUpdate(userId, {
  $push: { permissions: permission._id }
});
```

## Testing

To test the permission system:

1. Create users with different roles
2. Try accessing protected routes with different roles
3. Verify that permissions are enforced correctly
4. Test custom permissions by creating Permission documents

## Notes

- Admin role always has full access (`*` resource with `*` actions)
- Permission checks are cached at the session level for performance
- Default permissions are used as fallback if no database permissions exist
- All permission checks are server-side for security

