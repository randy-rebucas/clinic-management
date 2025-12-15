# Super Admin System

## Overview

The Super Admin system provides system-level access to manage all tenants and features across the entire application. Unlike regular admin users (which are tenant-scoped), super-admin has access to everything across all tenants.

## Key Features

- **System-level access**: Full access to all tenants and all features
- **Separate authentication**: Uses static credentials (not stored in database)
- **Separate subdomain**: Accessible via `backoffice.localhost:3000` (or configured subdomain)
- **Separate session management**: Uses different cookie and session system
- **Separate UI**: Dedicated backoffice interface

## Architecture

### Authentication

Super-admin uses **static credentials** defined in environment variables:

- `SUPER_ADMIN_EMAIL`: Super-admin email (default: `superadmin@system.local`)
- `SUPER_ADMIN_PASSWORD`: Super-admin password (default: `SuperAdmin@2024!ChangeMe`)

**⚠️ IMPORTANT: Change these credentials in production!**

### Session Management

Super-admin sessions are stored separately from regular user sessions:
- Cookie name: `super-admin-session` (vs `session` for regular users)
- Same JWT-based system but with different payload structure
- No database lookup required (static credentials)

### Subdomain Routing

The system uses middleware to detect the backoffice subdomain:
- `backoffice.localhost:3000` → Routes to `/backoffice/*`
- Regular subdomains → Routes to tenant-specific routes

## Access

### Development

1. Access: `http://backoffice.localhost:3000`
2. Login with default credentials:
   - Email: `superadmin@system.local`
   - Password: `SuperAdmin@2024!ChangeMe`

### Production

1. Configure environment variables:
   ```env
   SUPER_ADMIN_EMAIL=your-super-admin@email.com
   SUPER_ADMIN_PASSWORD=YourSecurePassword123!
   ROOT_DOMAIN=yourdomain.com
   ```

2. Configure DNS:
   - Point `backoffice.yourdomain.com` to your server

3. Access: `https://backoffice.yourdomain.com`

## Permissions

Super-admin has **full access** to:
- All tenants (view, create, update, delete)
- All tenant data (users, patients, appointments, etc.)
- System settings
- All API endpoints
- All resources and actions

This is enforced at the permission level - `hasPermissionByRole('super-admin', ...)` always returns `true`.

## File Structure

```
lib/
  super-admin.ts              # Super-admin configuration and utilities
app/
  (backoffice)/               # Backoffice route group
    layout.tsx                # Backoffice layout
    login/
      page.tsx                # Super-admin login page
    dashboard/
      page.tsx                # Super-admin dashboard
    tenants/
      page.tsx                # Tenant management
  actions/
    super-admin-auth.ts       # Super-admin authentication actions
  lib/
    dal.ts                    # Session management (includes super-admin)
    auth-helpers.ts           # Auth helpers (includes super-admin)
middleware.ts                 # Subdomain routing
```

## API Usage

### Check if user is super-admin

```typescript
import { isSuperAdmin, requireSuperAdmin } from '@/app/lib/auth-helpers';

// In API route
const isSuperAdminUser = await isSuperAdmin();

// In page (requires super-admin)
const session = await requireSuperAdmin();
```

### Check permissions

```typescript
import { hasPermissionByRole } from '@/lib/permissions';

// Super-admin always has access
const hasAccess = hasPermissionByRole('super-admin', 'any-resource', 'any-action');
// Returns: true
```

## Security Considerations

1. **Change default credentials**: Always change the default super-admin credentials in production
2. **Environment variables**: Store credentials in environment variables, never in code
3. **HTTPS**: Always use HTTPS in production for super-admin access
4. **IP restrictions**: Consider adding IP whitelist for super-admin access
5. **Audit logging**: All super-admin actions should be logged
6. **Session timeout**: Super-admin sessions expire after 7 days (configurable)

## Differences from Regular Admin

| Feature | Regular Admin | Super Admin |
|---------|--------------|-------------|
| Scope | Tenant-scoped | System-wide |
| Storage | Database (User model) | Static credentials |
| Session Cookie | `session` | `super-admin-session` |
| Subdomain | Tenant subdomain | `backoffice` subdomain |
| Access | Tenant resources only | All tenants + system |
| UI | Regular app UI | Backoffice UI |

## Troubleshooting

### Cannot access backoffice

1. Check subdomain: Ensure you're accessing `backoffice.localhost:3000`
2. Check middleware: Verify middleware is running
3. Check credentials: Verify environment variables are set correctly

### Session not persisting

1. Check cookie settings: Ensure cookies are being set
2. Check domain: Ensure cookie domain matches subdomain
3. Check HTTPS: In production, ensure HTTPS is enabled

### Permission denied

1. Verify super-admin session: Check if `verifySuperAdminSession()` returns valid session
2. Check permissions: Verify `hasPermissionByRole` includes super-admin check

## Future Enhancements

- [ ] IP whitelist for super-admin access
- [ ] Two-factor authentication
- [ ] Audit log viewer in backoffice
- [ ] System health monitoring
- [ ] Backup/restore functionality
- [ ] Tenant migration tools

