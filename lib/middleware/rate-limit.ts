/**
 * API Rate Limiting Middleware
 * Prevents abuse and ensures fair resource usage
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store (for single-instance deployments)
// For multi-instance deployments, use Redis or similar
const store: RateLimitStore = {};

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 5 * 60 * 1000);

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(request: NextRequest): string {
  // Try to get IP from various headers (for proxy/load balancer scenarios)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip'); // Cloudflare
  const ip = forwarded?.split(',')[0]?.trim() || realIp || cfConnectingIp || 'unknown';
  
  // Include user agent for additional identification
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // For authenticated users, use user ID for more accurate rate limiting
  // This allows higher limits for authenticated users
  const authHeader = request.headers.get('authorization');
  const userId = authHeader ? 'auth:' + authHeader.substring(0, 20) : 'anon';
  
  return `${ip}:${userId}:${userAgent.substring(0, 50)}`;
}

/**
 * Rate limit middleware
 */
export function rateLimit(config: RateLimitConfig) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const clientId = getClientIdentifier(request);
    const now = Date.now();
    
    // Get or create rate limit entry
    let entry = store[clientId];
    
    if (!entry || entry.resetTime < now) {
      // Create new entry or reset expired entry
      entry = {
        count: 0,
        resetTime: now + config.windowMs,
      };
      store[clientId] = entry;
    }
    
    // Increment request count
    entry.count++;
    
    // Check if limit exceeded
    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      return NextResponse.json(
        {
          success: false,
          error: config.message || 'Too many requests, please try again later',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
          },
        }
      );
    }
    
    // Add rate limit headers to response
    const remaining = Math.max(0, config.maxRequests - entry.count);
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
    
    return null; // null means continue to next middleware/handler
  };
}

/**
 * Pre-configured rate limiters for different use cases
 */
export const rateLimiters = {
  // Strict rate limit for authentication endpoints
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 requests per 15 minutes
    message: 'Too many authentication attempts, please try again later',
  }),
  
  // Standard API rate limit
  api: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    message: 'API rate limit exceeded, please slow down',
  }),
  
  // Strict rate limit for public endpoints
  public: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 requests per minute
    message: 'Rate limit exceeded, please try again later',
  }),
  
  // Lenient rate limit for authenticated users
  authenticated: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200, // 200 requests per minute
    message: 'Rate limit exceeded, please slow down',
  }),
};

/**
 * Helper to apply rate limiting in API routes
 */
export async function applyRateLimit(
  request: NextRequest,
  limiter: (req: NextRequest) => Promise<NextResponse | null>
): Promise<NextResponse | null> {
  return limiter(request);
}
