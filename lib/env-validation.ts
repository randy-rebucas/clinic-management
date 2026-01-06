/**
 * Environment variable validation
 * Validates required environment variables at startup
 */

interface EnvConfig {
  required: string[];
  optional: string[];
}

const envConfig: EnvConfig = {
  required: ['MONGODB_URI', 'SESSION_SECRET'],
  optional: [
    'ROOT_DOMAIN', // Root domain for multi-tenant subdomain detection (e.g., 'example.com' or 'localhost')
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
    'CRON_SECRET',
    'ENCRYPTION_KEY',
    'SENTRY_DSN', // Sentry DSN for error tracking and monitoring
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

  // Validate MONGODB_URI format if set
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.startsWith('mongodb://') && !process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
    errors.push('MONGODB_URI must be a valid MongoDB connection string');
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

