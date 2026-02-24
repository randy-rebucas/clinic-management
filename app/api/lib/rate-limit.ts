// Simple rate limiting middleware for Next.js API routes
// Usage: import and use in API handlers as needed

import { NextResponse } from 'next/server';

const RATE_LIMIT = 100; // requests
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const ipCache = new Map();

export function rateLimit(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  let entry = ipCache.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    entry = { count: 1, start: now };
  } else {
    entry.count++;
  }
  ipCache.set(ip, entry);
  if (entry.count > RATE_LIMIT) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  return null; // allow
}
