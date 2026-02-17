# Staff Login Guide - Email and Password Authentication

## Overview
Staff members (Nurses, Receptionists, and Accountants) can log in to the clinic management system using their email address and password. User accounts are automatically created when staff members are added to the system.

## How Staff Accounts Are Created

### Automatic User Account Creation
When an admin creates a staff member through the Staff Management interface (`/staff`), the system automatically:

1. **Creates the Staff Profile** (Nurse, Receptionist, or Accountant record)
2. **Triggers a Post-Save Hook** that automatically creates a corresponding User account
3. **Generates a Default Password** based on the staff type and employee information

### Default Password Generation

The system generates default passwords using the following pattern:

#### **Nurses**
- Format: `Nurse{last4digits}!`
- Example: If employee ID is `EMP12345` → Password: `Nurse2345!`
- Fallback: If no employee ID, uses last 4 digits of phone number
- Example: Phone `555-1234` → Password: `Nurse1234!`

#### **Receptionists**
- Format: `Recep{last4digits}!`
- Example: If employee ID is `REC00123` → Password: `Recep0123!`
- Fallback: If no employee ID, uses last 4 digits of phone number
- Example: Phone `555-9876` → Password: `Recep9876!`

#### **Accountants**
- Format: `Acct{last4digits}!`
- Example: If employee ID is `ACC00456` → Password: `Acct0456!`
- Fallback: If no employee ID, uses last 4 digits of phone number
- Example: Phone `555-5678` → Password: `Acct5678!`

### User Account Details

When a User account is created, it includes:
- **Email**: The staff member's email address (normalized to lowercase)
- **Name**: Full name (`firstName lastName`)
- **Password**: Hashed default password (using bcrypt with 10 rounds)
- **Role**: Automatically assigned based on staff type:
  - Nurse → `nurse` role
  - Receptionist → `receptionist` role
  - Accountant → `accountant` role
- **Profile Link**: Links to the staff profile via:
  - `nurseProfile` (for nurses)
  - `receptionistProfile` (for receptionists)
  - `accountantProfile` (for accountants)
- **Status**: Matches the staff member's status (`active` or `inactive`)

## How Staff Members Login

### Login Process

1. **Navigate to Login Page**
   - URL: `/login`
   - The system supports multi-tenant login (subdomain-based or clinic selection)

2. **Enter Credentials**
   - **Email**: The email address used when the staff member was created
   - **Password**: The default password (or changed password if already updated)

3. **Authentication Flow**
   The login process (`app/actions/auth.ts`) performs the following:
   
   a. **Form Validation**
      - Validates email format
      - Validates password is provided
   
   b. **Rate Limiting**
      - Checks for too many login attempts
      - Prevents brute force attacks
   
   c. **Database Lookup**
      - Finds user by email (case-insensitive)
      - Respects tenant context (multi-tenant support)
      - Populates role information
   
   d. **Password Verification**
      - Compares provided password with hashed password using bcrypt
      - Uses secure comparison to prevent timing attacks
   
   e. **Session Creation**
      - Creates a session with:
        - User ID
        - Email
        - Role name
        - Role ID
        - Tenant ID (if applicable)
   
   f. **Audit Logging**
      - Logs the login attempt for security tracking
   
   g. **Redirect**
      - Redirects to `/dashboard` on successful login

### Login Requirements

- **Email**: Must match the email address used when creating the staff member
- **Password**: Must match the current password (default or changed)
- **Status**: Staff member must have `active` status
- **Tenant Context**: Must be logging in from the correct tenant/clinic subdomain

### Security Features

1. **Password Hashing**
   - Passwords are hashed using bcrypt with 10 salt rounds
   - Original passwords are never stored in plain text

2. **Rate Limiting**
   - Prevents brute force attacks
   - Limits login attempts per email address
   - Shows error message: "Too many login attempts. Please try again in X minute(s)."

3. **Generic Error Messages**
   - Returns "Invalid email or password" for both invalid email and invalid password
   - Prevents user enumeration attacks

4. **Email Sanitization**
   - Email addresses are normalized to lowercase
   - Trimmed of whitespace
   - Validated for proper format

5. **Multi-Tenant Security**
   - Users can only log in within their tenant context
   - Prevents cross-tenant access

## Default Password Information

### Where to Find Default Passwords

When a staff member is created, the default password is:
- **Logged to Console**: The system logs the default password to the server console
- **Format**: `{StaffType}{Last4Digits}!`
- **Example Log**: `✅ Created user account for nurse: nurse@example.com (default password: Nurse2345!)`

### Important Notes

⚠️ **Security Consideration**: Default passwords should be:
- Communicated securely to staff members
- Changed on first login (recommended)
- Not shared via insecure channels

⚠️ **Password Requirements**:
- Minimum 8 characters (enforced by User model)
- Default passwords meet this requirement

## Code Locations

### Staff Creation
- **API Route**: `app/api/staff/route.ts` (POST method)
- **Client Component**: `components/StaffManagementClient.tsx`
- **Page**: `app/(app)/staff/page.tsx`

### User Account Creation (Post-Save Hooks)
- **Nurses**: `models/Nurse.ts` (lines 208-275)
- **Receptionists**: `models/Receptionist.ts` (lines 190-257)
- **Accountants**: `models/Accountant.ts` (lines 204-271)

### Login Authentication
- **Login Action**: `app/actions/auth.ts` (login function, lines 124-247)
- **Login Form**: `components/LoginForm.tsx`
- **User Model**: `models/User.ts`

### Session Management
- **Session Creation**: `app/lib/dal.ts` (createSession function)
- **Session Verification**: `app/lib/dal.ts` (verifySession function)

## Troubleshooting

### Common Issues

1. **"Invalid email or password"**
   - Verify email address is correct (case-insensitive)
   - Check if default password was used correctly
   - Ensure staff member status is `active`
   - Verify tenant context matches

2. **"Too many login attempts"**
   - Wait for the rate limit to expire
   - Contact admin to reset rate limit if needed

3. **User account not created**
   - Check server console logs for errors
   - Verify role exists in database
   - Ensure email is unique within tenant

4. **Cannot find user**
   - Verify tenant context is correct
   - Check if user was created in the correct tenant
   - Ensure email matches exactly (after normalization)

## Summary

Staff members can log in using:
- **Email**: The email address provided when they were added to the system
- **Password**: Default password format `{StaffType}{Last4Digits}!` or a changed password

The system automatically creates user accounts when staff members are added, ensuring seamless access to the clinic management system.

