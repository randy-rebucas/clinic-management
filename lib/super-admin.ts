/**
 * Super Admin Configuration
 * 
 * Super-admin is a system-level role that exists outside the database.
 * It has full access to all tenants and all features.
 * 
 * IMPORTANT: Change these credentials in production!
 */

export const SUPER_ADMIN_CONFIG = {
  // Static credentials (change in production!)
  email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@system.local',
  password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@2024!ChangeMe',
  
  // Session configuration
  sessionCookieName: 'super-admin-session',
  sessionDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
  
  // Role identifier
  role: 'super-admin' as const,
  
  // Backoffice subdomain
  backofficeSubdomain: 'backoffice',
};

/**
 * Verify super-admin credentials
 */
export function verifySuperAdminCredentials(email: string, password: string): boolean {
  return (
    email.toLowerCase().trim() === SUPER_ADMIN_CONFIG.email.toLowerCase().trim() &&
    password === SUPER_ADMIN_CONFIG.password
  );
}

/**
 * Check if email matches super-admin email
 */
export function isSuperAdminEmail(email: string): boolean {
  return email.toLowerCase().trim() === SUPER_ADMIN_CONFIG.email.toLowerCase().trim();
}

/**
 * Super-admin session payload
 */
export interface SuperAdminSessionPayload {
  email: string;
  role: 'super-admin';
  expiresAt: number | Date;
  isSuperAdmin: true;
}

