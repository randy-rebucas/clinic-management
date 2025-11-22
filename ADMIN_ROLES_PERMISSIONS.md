# Admin Roles & Permissions Management Interface

## Overview

A comprehensive admin interface has been created to manage roles and permissions from the admin side. This allows administrators to:

1. **Manage Roles** - Create, edit, and delete roles
2. **Assign Permissions** - Configure permissions for each role
3. **Manage User Roles** - Assign roles to users
4. **View Permissions** - See all permissions in the system

## Admin Pages

### 1. Roles Management (`/admin/roles`)

**Features:**
- View all roles in the system
- Create new roles
- Edit existing roles (name, display name, description, level, active status)
- Delete roles (with safety checks - cannot delete if users have the role)
- Manage permissions for each role

**Permission Matrix:**
- Visual grid showing all resources and actions
- Click to toggle permissions on/off
- Supports wildcard permissions (*)

**Access:** Admin only

### 2. User Role Management (`/admin/users`)

**Features:**
- View all users in the system
- See current role for each user
- Change user roles
- View user status (active/inactive)

**Access:** Admin only

## API Endpoints

### Roles API

#### `GET /api/roles`
- Get all roles
- Returns roles with populated permissions
- Admin only

#### `POST /api/roles`
- Create a new role
- Body: `{ name, displayName, description, level, isActive }`
- Admin only

#### `GET /api/roles/[id]`
- Get a single role by ID
- Admin only

#### `PUT /api/roles/[id]`
- Update a role
- Body: `{ name?, displayName?, description?, level?, isActive? }`
- Admin only

#### `DELETE /api/roles/[id]`
- Delete a role
- Safety check: Cannot delete if users have this role
- Admin only

#### `PUT /api/roles/[id]/permissions`
- Update role permissions
- Body: `{ defaultPermissions: [{ resource, actions: [] }] }`
- Admin only

### Permissions API

#### `GET /api/permissions`
- Get all permissions
- Query params: `userId?`, `roleId?`, `resource?`
- Admin only

#### `POST /api/permissions`
- Create a new permission
- Body: `{ user?, role?, resource, actions: [] }`
- Admin only

#### `GET /api/permissions/[id]`
- Get a single permission
- Admin only

#### `PUT /api/permissions/[id]`
- Update a permission
- Admin only

#### `DELETE /api/permissions/[id]`
- Delete a permission
- Automatically removes from user/role references
- Admin only

### User Role API

#### `PUT /api/users/[id]/role`
- Update a user's role
- Body: `{ roleId }`
- Admin only

## Navigation

Admin menu items are automatically added to the sidebar for admin users:

- **Roles & Permissions** (`/admin/roles`) - Manage roles and their permissions
- **User Management** (`/admin/users`) - Manage user roles

These items only appear for users with the `admin` role.

## Usage Guide

### Creating a New Role

1. Navigate to `/admin/roles`
2. Click "Create Role"
3. Fill in:
   - Role Name (must be one of: admin, doctor, nurse, receptionist, accountant)
   - Display Name
   - Description (optional)
   - Level (hierarchy level, higher = more privileges)
   - Active status
4. Click "Create"
5. Click "Permissions" to configure permissions for the role

### Managing Role Permissions

1. Click "Permissions" button next to a role
2. Use the grid to toggle permissions:
   - Rows = Resources (patients, appointments, etc.)
   - Columns = Actions (read, write, update, delete)
   - Click a cell to toggle that permission
3. Click "Save Permissions" when done

### Assigning Roles to Users

1. Navigate to `/admin/users`
2. Find the user you want to update
3. Click "Change Role"
4. Select the new role from the dropdown
5. Click "Save"

### Creating Custom Permissions

Custom permissions can be created via the API for specific users or roles:

```typescript
// Create permission for a user
POST /api/permissions
{
  "user": "userId",
  "resource": "patients",
  "actions": ["read", "write", "update"]
}

// Create permission for a role
POST /api/permissions
{
  "role": "roleId",
  "resource": "reports",
  "actions": ["read"]
}
```

## Security

- All admin endpoints require admin role
- Role deletion is protected (cannot delete if users have the role)
- Permission validation ensures valid resource/action combinations
- All operations are logged (via audit system)

## Resources and Actions

### Resources
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
- `settings` - System settings

### Actions
- `read` - View/list resources
- `write` - Create new resources
- `update` - Modify existing resources
- `delete` - Remove resources

### Wildcards
- `*` resource - Access to all resources
- `*` action - All actions for a resource

## Default Roles

The system comes with these default roles:

1. **Admin** - Full access to everything
2. **Doctor** - Clinical resources (patients, visits, prescriptions, lab-results)
3. **Nurse** - Clinical resources (read/write, limited delete)
4. **Receptionist** - Scheduling and patient management
5. **Accountant** - Billing and financial resources

These can be customized via the admin interface.

## Best Practices

1. **Role Hierarchy**: Use the `level` field to establish role hierarchy
2. **Principle of Least Privilege**: Only grant necessary permissions
3. **Regular Audits**: Review permissions periodically
4. **Test Changes**: Test permission changes in a development environment first
5. **Document Custom Permissions**: Document any custom permissions created

## Troubleshooting

### User can't access a resource
1. Check user's role in `/admin/users`
2. Check role permissions in `/admin/roles`
3. Verify permission is enabled for the resource/action
4. Check for custom permissions that might override defaults

### Can't delete a role
- Ensure no users are assigned to the role
- Reassign users to different roles first

### Permission changes not taking effect
- Users may need to log out and log back in
- Check that permissions were saved correctly
- Verify the permission check is using the correct resource/action names

