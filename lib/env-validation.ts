import { redisRestEnv } from './redis';

/**
 * Environment variable validation
 * Validates required environment variables at startup
 */

interface EnvConfig {
  required: string[];
  optional: string[];
}

const envConfig: EnvConfig = {
  required: ['MONGODB_URI', 'SESSION_SECRET', 'CRON_SECRET', 'ENCRYPTION_KEY'],
  optional: [
    'ROOT_DOMAIN', // Root domain for multi-tenant subdomain detection and the CSRF origin check
    'INSTALL_SECRET', // Bearer secret for /api/install/* (all environments); routes are disabled when unset
    'UPSTASH_REDIS_REST_URL', // Shared rate-limit store (falls back to per-instance memory when unset)
    'UPSTASH_REDIS_REST_TOKEN',
    'KV_REST_API_URL', // Same, under the names Vercel's Upstash integration sets
    'KV_REST_API_TOKEN',
    'BLOB_STORE_ID', // Private Vercel Blob store for audit log archives (lib/audit-archive.ts); OIDC on Vercel
    'BLOB_READ_WRITE_TOKEN', // Same store from outside Vercel
    'LAB_WEBHOOK_SECRET', // HMAC secret for third-party lab webhook verification
    'DOCUMENT_SEAL_SECRET', // HMAC key for printed-document seals (falls back to a key derived from SESSION_SECRET)
    'DOCUMENT_VERIFY_BASE_URL', // Canonical origin printed in document QR codes, e.g. https://www.myclinicsoft.solutions
    'DOCUMENT_ANTI_INSPECT', // Set to "off" to disable the DevTools trap on protected documents
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'SENTRY_DSN', // Sentry DSN for error tracking and monitoring
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY', // PWA push notifications
    'VAPID_PRIVATE_KEY', // PWA push notifications
  ],
};

/**
 * Validate environment variables
 * Throws error if required variables are missing in production
 */
export function validateEnv(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';

  // Check required variables
  for (const key of envConfig.required) {
    if (!process.env[key]) {
      if (isProduction) {
        errors.push(`Required environment variable ${key} is not set`);
      } else {
        console.warn(`Warning: Required environment variable ${key} is not set`);
      }
    }
  }

  // Validate SESSION_SECRET length if set
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
    errors.push('SESSION_SECRET must be at least 32 characters long');
  }

  // Validate CRON_SECRET length if set
  if (process.env.CRON_SECRET && process.env.CRON_SECRET.length < 32) {
    errors.push('CRON_SECRET must be at least 32 characters long');
  }

  // Validate ENCRYPTION_KEY — must be a 64-char hex string (32 bytes for AES-256)
  if (process.env.ENCRYPTION_KEY && !/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)) {
    errors.push('ENCRYPTION_KEY must be a 64-character hex string (32 bytes for AES-256)');
  }

  const redis = redisRestEnv();
  if (!!redis.url !== !!redis.token) {
    errors.push('Redis REST URL and token must be set together (UPSTASH_REDIS_REST_URL/_TOKEN or KV_REST_API_URL/_TOKEN)');
  }

  if (process.env.INSTALL_SECRET && process.env.INSTALL_SECRET.length < 32) {
    errors.push('INSTALL_SECRET must be at least 32 characters long');
  }

  // Validate DOCUMENT_SEAL_SECRET length if set
  if (process.env.DOCUMENT_SEAL_SECRET && process.env.DOCUMENT_SEAL_SECRET.length < 32) {
    errors.push('DOCUMENT_SEAL_SECRET must be at least 32 characters long');
  }

  // Validate MONGODB_URI format if set
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.startsWith('mongodb://') && !process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
    errors.push('MONGODB_URI must be a valid MongoDB connection string');
  }

  // Not fatal, but each leaves a protection off in production; say so at every start.
  if (isProduction) {
    if (!redisRestEnv().url) {
      console.warn('Security: UPSTASH_REDIS_REST_* (or KV_REST_API_*) unset; login and OTP rate limits are per serverless instance.');
    }
    if (!process.env.TURNSTILE_SECRET_KEY) {
      console.warn('Security: TURNSTILE_SECRET_KEY unset; public booking and registration have no bot check.');
    }
    if (!process.env.DOCUMENT_VERIFY_BASE_URL) {
      console.warn('Security: DOCUMENT_VERIFY_BASE_URL unset; printed QR codes take their host from the request.');
    }
    if (process.env.PLATFORM_LINK_TO_LOG === 'true') {
      console.warn('Security: PLATFORM_LINK_TO_LOG=true; platform console sign-in links are written to the log.');
    }
  }

  // In production, throw if there are errors
  if (isProduction && errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get environment variable with validation
 */
export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  
  if (!value && envConfig.required.includes(key)) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  
  return value || '';
}

/**
 * Check if optional feature is enabled
 */
export function isFeatureEnabled(feature: 'sms' | 'email' | 'cloudinary'): boolean {
  switch (feature) {
    case 'sms':
      return !!(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER
      );
    case 'email':
      return !!(
        process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS
      );
    case 'cloudinary':
      return !!(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
      );
    default:
      return false;
  }
}

