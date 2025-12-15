# Authentication System Documentation

## Overview

MyClinicSoft implements a secure authentication system following Next.js 16 best practices with JWT-based session management.

## Architecture

### Components

1. **Session Management** (`app/lib/dal.ts`)
   - JWT-based session tokens using `jose` library
   - 7-day session expiration
   - Secure cookie storage (httpOnly, secure in production)

2. **Authentication Actions** (`app/actions/auth.ts`)
   - Server actions for signup, login, logout
   - Password hashing with bcryptjs
   - Rate limiting protection
   - Input sanitization

3. **Auth Helpers** (`app/lib/auth-helpers.ts`)
   - Role-based access control utilities
   - Authorization helpers for pages and API routes

4. **Security Utilities** (`app/lib/security.ts`)
   - Rate limiting (5 attempts per 15 minutes)
   - Input sanitization
   - Validation helpers

## Security Features

### ✅ Implemented

1. **Password Security**
   - Bcrypt hashing with salt rounds (10)
   - Strong password requirements (8+ chars, letter, number, special char)
   - Passwords never stored in plain text

2. **Session Security**
   - JWT tokens with HS256 algorithm
   - HttpOnly cookies (prevents XSS)
   - Secure flag in production (HTTPS only)
   - SameSite: lax (CSRF protection)
   - Automatic expiration validation
   - Session cleanup on expiration

3. **Rate Limiting**
   - 5 login attempts per 15 minutes per email
   - Automatic lockout after max attempts
   - Reset on successful login

4. **Input Validation**
   - Zod schema validation
   - Email normalization (lowercase)
   - Input sanitization
   - Generic error messages (prevents user enumeration)

5. **Route Protection**
   - All pages require authentication (server-side check)
   - All API routes require authentication
   - Automatic redirect to `/login` if not authenticated
   - Role-based access control helpers available

6. **Error Handling**
   - Generic error messages (security through obscurity)
   - Proper HTTP status codes (401, 403)
   - Graceful error handling

## User Roles

- **admin**: Full system access
- **user**: Standard user access
- **doctor**: Doctor-specific access

## API Usage

### Pages (Server Components)

```typescript
import { requireAuth, requireRole, requireAdmin } from '@/app/lib/auth';

// Require any authenticated user
export default async function MyPage() {
  const session = await requireAuth();
  // User is authenticated
}

// Require specific role(s)
export default async function AdminPage() {
  const session = await requireRole(['admin']);
  // User is authenticated and is admin
}

// Require admin
export default async function AdminOnlyPage() {
  const session = await requireAdmin();
  // User is authenticated and is admin
}
```

### API Routes

```typescript
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse, hasRole, isAdmin } from '@/app/lib/auth-helpers';

export async function GET() {
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }
  
  // Check role if needed
  if (!isAdmin(session)) {
    return forbiddenResponse('Admin access required');
  }
  
  // Proceed with authorized request
}
```

## Environment Variables

Required:
- `SESSION_SECRET`: Secret key for JWT signing (required in production)
  - Generate: `openssl rand -base64 32`
  - Must be at least 32 characters long

## Session Lifecycle

1. **Login**: User credentials validated → Session created → Cookie set
2. **Request**: Cookie read → Session verified → Expiration checked
3. **Expiration**: Session expired → Cookie deleted → Redirect to login
4. **Logout**: Cookie deleted → Redirect to login

## Security Best Practices

1. ✅ Passwords hashed with bcrypt
2. ✅ Sessions stored in httpOnly cookies
3. ✅ JWT tokens signed with secret key
4. ✅ Rate limiting on login attempts
5. ✅ Input validation and sanitization
6. ✅ Generic error messages
7. ✅ Email normalization
8. ✅ Session expiration validation
9. ✅ Secure cookies in production
10. ✅ CSRF protection (SameSite: lax)

## Known Issues

- **Source Map Warning**: In Next.js 16.0.3 with Turbopack, you may see "Invalid source map" warnings in development. This is a known Turbopack issue and doesn't affect functionality. Use `npm run dev:webpack` to avoid the warning.

## Future Enhancements

- [ ] Password reset functionality
- [ ] Email verification
- [ ] Two-factor authentication (2FA)
- [ ] Session refresh tokens
- [ ] Redis-based rate limiting (for production scale)
- [ ] Audit logging for authentication events
- [ ] Account lockout after multiple failed attempts
- [ ] Password strength meter
- [ ] Remember me functionality

