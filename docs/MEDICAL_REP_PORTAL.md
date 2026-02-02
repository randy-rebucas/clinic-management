# Medical Representative Portal Guide

## Overview
The Medical Representative Portal provides a dedicated dashboard for medical representatives to manage their profile, track activities, and access their account information.

## Features

### Dashboard Page
**Location:** `/medical-representative/portal`

The dashboard includes:
- **Profile Information**: View your personal and professional details
- **Stats Overview**: Track visits, products, and territory coverage
- **Quick Actions**: Easy access to common tasks
- **Recent Activity**: View your latest interactions and updates

### Components Created

1. **MedicalRepresentativeDashboardClient.tsx**
   - Main dashboard component with full UI
   - Fetches medical representative data from session API
   - Displays profile information, statistics, and quick actions
   - Handles logout functionality

2. **Dashboard Page** (`app/(medical-representative-portal)/medical-representative/portal/page.tsx`)
   - Server component wrapper for the dashboard
   - Sets metadata for SEO

3. **Session API** (`app/api/medical-representatives/session/route.ts`)
   - GET: Retrieves current medical representative data
   - DELETE: Logs out and deletes session cookie
   - Includes authorization checks

## Authentication Flow

1. **Login** → `/medical-representatives/login`
2. **Session Created** → JWT token stored in cookie
3. **Redirect** → `/medical-representative/portal`
4. **Dashboard Loads** → Fetches data from `/api/medical-representatives/session`

## API Endpoints

### GET /api/medical-representatives/session
Retrieves the current medical representative's profile data.

**Requirements:**
- Valid session cookie
- Role must be 'medical-representative'

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "company": "Pharma Corp",
    "territory": "Metro Manila",
    "products": ["Product A", "Product B"],
    "isActivated": true,
    "status": "active",
    ...
  }
}
```

### DELETE /api/medical-representatives/session
Logs out the medical representative by deleting the session cookie.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Dashboard Sections

### 1. Header
- Company name display
- User name and title
- Logout button

### 2. Activation Status Banner
- Shows warning if account is not activated
- Displays when `isActivated = false`

### 3. Statistics Cards
- **Total Visits**: Tracks all clinic visits (future feature)
- **This Month**: Current month's visit count
- **Active Products**: Number of products represented
- **Territory**: Territory coverage count

### 4. Profile Information Card
Displays:
- Full name and title
- Contact information (email, phone)
- Company and territory
- Account status and member since date
- Bio (if available)
- Products list with badges

### 5. Quick Actions Panel
Action buttons for:
- Edit Profile
- View Products
- Track Visits
- Settings
- Help & Support

### 6. Recent Activity
- Placeholder for future activity tracking
- Will show visit logs, product updates, etc.

## Styling

The portal uses a **purple gradient theme** to match the medical representative branding:
- Primary: Purple-600 to Indigo-600
- Accent colors for different action types (blue, green, indigo)
- Clean, professional design with hover effects
- Responsive layout (mobile, tablet, desktop)

## Security Features

1. **Session Verification**: All requests verify JWT session
2. **Role-Based Access**: Only 'medical-representative' role can access
3. **User Authorization**: Data is scoped to the logged-in user
4. **Activation Check**: Warns if account is pending activation

## Future Enhancements

The dashboard is designed with placeholders for:
1. **Visit Tracking System**: Track clinic visits and interactions
2. **Product Management**: Add/edit represented products
3. **Profile Editing**: Update personal and professional information
4. **Settings Page**: Account preferences and notifications
5. **Activity Log**: Detailed history of all actions
6. **Reports**: Generate performance reports
7. **Notifications**: Real-time updates and alerts

## Navigation Routes

All routes are protected and require authentication:

- `/medical-representative/portal` - Main dashboard
- `/medical-representative/profile/edit` - Edit profile (future)
- `/medical-representative/products` - Product management (future)
- `/medical-representative/visits` - Visit tracking (future)
- `/medical-representative/settings` - Account settings (future)
- `/medical-representative/support` - Help and support (future)

## Integration with Existing System

The portal integrates with:
- **Authentication System**: Uses existing JWT session management
- **User Model**: Links via `userId` field in MedicalRepresentative
- **Role System**: Uses 'medical-representative' role
- **Audit Logging**: All actions can be logged via AuditLog model

## Testing

To test the portal:

1. **Register a medical representative:**
   - Go to `/medical-representatives/onboard`
   - Complete the 4-step registration
   - Note the temporary password from email

2. **Login:**
   - Go to `/medical-representatives/login`
   - Use registered email and password "Password1234!"
   - Should redirect to dashboard

3. **View Dashboard:**
   - Check profile information is displayed correctly
   - Verify all sections render properly
   - Test logout functionality

## Troubleshooting

### Common Issues

1. **401 Unauthorized Error**
   - Session may have expired
   - Try logging in again
   - Clear cookies and retry

2. **Activation Warning**
   - Account is pending payment verification
   - Contact admin to verify payment status

3. **Data Not Loading**
   - Check network tab for API errors
   - Verify session cookie exists
   - Check browser console for errors

## Related Documentation

- [MEDICAL_REP_ONBOARDING.md](./MEDICAL_REP_ONBOARDING.md) - Registration process
- [STAFF_LOGIN_GUIDE.md](../STAFF_LOGIN_GUIDE.md) - General login patterns
- [README.md](../README.md) - Main project documentation

---

**Last Updated:** February 1, 2026
**Version:** 1.0.0
