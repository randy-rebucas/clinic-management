# System Setup Guide

## Overview

The clinic management system includes an initial setup page that automatically creates all necessary roles, permissions, and an admin user account.

## Setup Process

### Accessing Setup

1. Navigate to `/setup` in your browser
2. The setup page will automatically appear if the system hasn't been initialized yet
3. If setup is already complete, you'll be redirected to the login page

### Setup Requirements

The setup process requires:

- **Admin Name**: Full name for the administrator account
- **Admin Email**: Email address for the administrator account (will be used for login)
- **Admin Password**: Must meet these requirements:
  - At least 8 characters long
  - Contains at least one letter
  - Contains at least one number
  - Contains at least one special character
- **Clinic Name** (optional): Name of your clinic

### What Gets Created

During setup, the following are automatically created:

#### 1. Default Roles

Five default roles are created with their permissions:

- **Admin** (Level 100)
  - Full system access (`*` resource with `*` actions)
  - Can manage all aspects of the system

- **Doctor** (Level 80)
  - Patients: read, write, update
  - Visits: read, write, update, delete
  - Prescriptions: read, write, update
  - Lab Results: read, write, update
  - Appointments: read, write, update
  - Invoices: read
  - Doctors: read
  - Reports: read
  - Queue: read, write, update
  - Referrals: read, write, update

- **Nurse** (Level 60)
  - Patients: read, write, update
  - Visits: read, write, update
  - Prescriptions: read
  - Lab Results: read, write, update
  - Appointments: read, write, update
  - Invoices: read
  - Doctors: read
  - Queue: read, write, update

- **Receptionist** (Level 40)
  - Patients: read, write, update
  - Appointments: read, write, update, delete
  - Visits: read
  - Invoices: read, write, update
  - Doctors: read
  - Queue: read, write, update

- **Accountant** (Level 30)
  - Patients: read
  - Invoices: read, write, update
  - Appointments: read
  - Reports: read

#### 2. Admin User Account

- Created with the credentials you provide
- Assigned the Admin role
- Status set to "active"
- Can immediately log in after setup

#### 3. System Settings

All default system settings are created with sensible defaults:

**Clinic Information:**
- Clinic name (from setup form or default)
- Clinic email (from admin email)
- Empty fields for address, phone, website, tax ID, license number

**Business Hours:**
- Monday-Friday: 9:00 AM - 5:00 PM
- Saturday: 9:00 AM - 1:00 PM
- Sunday: Closed

**Appointment Settings:**
- Default duration: 30 minutes
- Reminders: 24 hours and 2 hours before
- Online booking: Enabled
- Max advance booking: 90 days
- Min advance booking: 2 hours

**Communication Settings:**
- SMS: Disabled (can be enabled later)
- Email: Disabled (can be enabled later)
- Appointment reminders: Enabled
- Lab result notifications: Enabled
- Invoice reminders: Enabled

**Billing Settings:**
- Currency: PHP
- Tax rate: 0%
- Payment terms: 30 days
- Late fee: 0%
- Invoice prefix: INV
- Partial payments: Allowed

**Queue Settings:**
- Queue enabled: Yes
- Auto-assign rooms: No
- Estimated wait time: 15 minutes
- Public display: No

**General Settings:**
- Timezone: UTC
- Date format: MM/DD/YYYY
- Time format: 12-hour
- Items per page: 20
- Audit log: Enabled
- Session timeout: 8 hours (480 minutes)

**Integration Settings:**
- Cloudinary: Disabled
- Twilio: Disabled
- SMTP: Disabled

**Display Settings:**
- Theme: Light
- Sidebar collapsed: Yes
- Show notifications: Yes

## Setup Flow

```
1. User visits any page
   ↓
2. System checks if setup is complete
   ↓
3. If not complete → Redirect to /setup
   ↓
4. User fills out setup form
   ↓
5. System creates roles, permissions, and admin user
   ↓
6. Redirect to /login
   ↓
7. User logs in with admin credentials
```

## Security Features

### Setup Protection

- Setup can only be run once
- If admin user already exists, setup is blocked
- Setup page shows "Already Complete" message if setup was done

### Password Validation

- Real-time password validation
- Visual feedback for password requirements
- Password confirmation matching

### Email Validation

- Email format validation
- Email normalization (lowercase, trimmed)

## API Endpoints

### Check Setup Status

```http
GET /api/setup
```

**Response:**
```json
{
  "success": true,
  "setupComplete": true,
  "message": "Setup already complete"
}
```

### Run Setup

```http
POST /api/setup
Content-Type: application/json

{
  "adminName": "John Doe",
  "adminEmail": "admin@clinic.com",
  "adminPassword": "SecurePass123!",
  "clinicName": "My Clinic"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Setup completed successfully",
  "data": {
    "adminUser": {
      "_id": "...",
      "name": "John Doe",
      "email": "admin@clinic.com"
    },
    "rolesCreated": 5
  }
}
```

## Troubleshooting

### Setup Already Complete Error

If you see "Setup already completed" but need to reset:

1. Manually delete the admin user from the database
2. Delete all roles from the database
3. Access `/setup` again

**Warning:** Only do this if you understand the consequences. This will remove all user accounts and roles.

### Password Requirements Not Met

Ensure your password:
- Is at least 8 characters
- Contains at least one letter (a-z, A-Z)
- Contains at least one number (0-9)
- Contains at least one special character (!@#$%^&*(), etc.)

### Email Already Exists

If the email is already in use:
- Use a different email address
- Or delete the existing user first (if you have access)

## Post-Setup Steps

After completing setup:

1. **Log in** with your admin credentials
2. **Review roles** at `/admin/roles` to ensure they meet your needs
3. **Create additional users** as needed
4. **Customize permissions** for specific roles if required
5. **Configure settings** at `/settings`

## Best Practices

1. **Secure Admin Password**: Use a strong, unique password
2. **Document Credentials**: Store admin credentials securely
3. **Review Permissions**: Check default role permissions after setup
4. **Create Backup Users**: Create additional admin accounts for redundancy
5. **Test Access**: Verify you can log in and access all features

## Manual Setup (Advanced)

If you need to manually create roles and users:

1. Use MongoDB directly or a database tool
2. Create roles following the Role model schema
3. Create admin user following the User model schema
4. Ensure role references are correct

See `ROLES_PERMISSIONS_IMPLEMENTATION.md` for detailed schema information.

