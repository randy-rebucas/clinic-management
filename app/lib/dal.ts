import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

const secretKey = process.env.SESSION_SECRET;
// Only enforce SESSION_SECRET at runtime, not during build
// During build, Next.js sets NODE_ENV=production but we're not actually running
// We'll validate at runtime when functions are called instead of at module load
const encodedKey = new TextEncoder().encode(
  secretKey || 'default-secret-key-change-in-production-dev-only'
);

// Runtime validation function - call this when actually using the secret
function validateSecret() {
  if (!secretKey && process.env.NODE_ENV === 'production') {
    // Only throw if we're actually in a runtime context (not build)
    // Check if we're in a build by trying to detect build context
    const isBuildContext = process.env.NEXT_PHASE === 'phase-production-build' || 
                          process.env.NEXT_PHASE === 'phase-development-build';
    if (!isBuildContext) {
      throw new Error('SESSION_SECRET environment variable is required in production');
    }
  }
}

export interface SessionPayload extends JWTPayload {
  userId: string;
  email: string;
  role: 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant';
  expiresAt: number | Date;
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  validateSecret(); // Validate at runtime, not build time
  // Convert expiresAt to number if it's a Date for JWT compatibility
  const jwtPayload: JWTPayload = {
    ...payload,
    expiresAt: payload.expiresAt instanceof Date ? payload.expiresAt.getTime() / 1000 : payload.expiresAt,
  };
  return new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey);
}

export async function decrypt(session: string | undefined = ''): Promise<SessionPayload | null> {
  try {
    validateSecret(); // Validate at runtime, not build time
    if (!session) return null;
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ['HS256'],
    });
    
    // Validate payload structure
    if (
      typeof payload !== 'object' ||
      !payload ||
      typeof (payload as any).userId !== 'string' ||
      typeof (payload as any).email !== 'string' ||
      typeof (payload as any).role !== 'string'
    ) {
      return null;
    }
    
    const sessionPayload = payload as unknown as SessionPayload;
    
    // Check if session has expired
    const expiresAt = typeof sessionPayload.expiresAt === 'number' 
      ? new Date(sessionPayload.expiresAt * 1000) 
      : new Date(sessionPayload.expiresAt);
    
    if (expiresAt && expiresAt < new Date()) {
      return null;
    }
    
    return sessionPayload;
  } catch (error) {
    // Silently fail - session is invalid or expired
    return null;
  }
}

export async function createSession(userId: string, email: string, role: 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant') {
  try {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const session = await encrypt({ userId, email, role, expiresAt });

    const cookieStore = await cookies();
    cookieStore.set('session', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
      sameSite: 'lax',
      path: '/',
    });
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

export async function updateSession() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    const payload = await decrypt(session);

    if (!session || !payload) {
      return null;
    }

    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const res = await encrypt({ ...payload, expiresAt: expires });

    cookieStore.set('session', res, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      expires: expires,
      sameSite: 'lax',
      path: '/',
    });
  } catch (error) {
    console.error('Error updating session:', error);
    return null;
  }
}

export async function deleteSession() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('session');
  } catch (error) {
    console.error('Error deleting session:', error);
  }
}

/**
 * Verify the current user session from cookies
 * 
 * Note: In Next.js 16.0.3 with Turbopack, you may see a source map warning
 * in development. This is a known Turbopack issue and doesn't affect functionality.
 * 
 * @returns SessionPayload if authenticated, null otherwise
 */
export async function verifySession(): Promise<SessionPayload | null> {
  try {
    // Get cookies - await is required in Next.js 16
    const cookieStore = await cookies();
    if (!cookieStore) {
      return null;
    }
    
    const cookie = cookieStore.get('session')?.value;
    
    if (!cookie) {
      return null;
    }
    
    const session = await decrypt(cookie);

    if (!session) {
      return null;
    }

    // Additional expiration check
    const expiresAt = typeof session.expiresAt === 'number' 
      ? new Date(session.expiresAt * 1000) 
      : new Date(session.expiresAt);
    
    if (expiresAt && expiresAt < new Date()) {
      // Session expired - delete it
      await deleteSession();
      return null;
    }

    return session;
  } catch (error) {
    // Silently fail - user is not authenticated
    // This handles cases where cookies() might not be available in certain contexts
    return null;
  }
}

export async function getUser() {
  try {
    const session = await verifySession();
    if (!session) return null;

    await connectDB();
    const user = await User.findById(session.userId).select('-password').lean();
    if (!user || Array.isArray(user)) return null;
    
    // Type assertion for lean() result
    const userObj = user as { _id: { toString(): string }; [key: string]: any };
    return {
      ...userObj,
      _id: userObj._id.toString(),
    };
  } catch (error) {
    console.error('Failed to get user:', error);
    return null;
  }
}

/**
 * Get the current authenticated user's ID from session
 * Returns null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await verifySession();
  return session?.userId || null;
}
