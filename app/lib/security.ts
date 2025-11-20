/**
 * Security utilities for authentication and authorization
 */

/**
 * Sanitize email input - normalize to lowercase and trim
 */
export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Validate that a string is a valid MongoDB ObjectId
 */
export function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Rate limiting helper (simple in-memory implementation)
 * For production, consider using Redis or a dedicated rate limiting service
 */
const loginAttempts = new Map<string, { count: number; resetTime: number }>();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(identifier: string): { allowed: boolean; remainingTime?: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(identifier);

  if (!attempt) {
    loginAttempts.set(identifier, { count: 1, resetTime: now + LOCKOUT_DURATION });
    return { allowed: true };
  }

  // Reset if lockout period has passed
  if (now > attempt.resetTime) {
    loginAttempts.set(identifier, { count: 1, resetTime: now + LOCKOUT_DURATION });
    return { allowed: true };
  }

  // Check if max attempts reached
  if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
    const remainingTime = Math.ceil((attempt.resetTime - now) / 1000 / 60); // minutes
    return { allowed: false, remainingTime };
  }

  // Increment attempt count
  attempt.count++;
  loginAttempts.set(identifier, attempt);
  return { allowed: true };
}

export function resetRateLimit(identifier: string): void {
  loginAttempts.delete(identifier);
}

