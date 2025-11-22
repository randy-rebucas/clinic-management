import connectDB from '@/lib/mongodb';
import Role from '@/models/Role';
import User from '@/models/User';

/**
 * Check if system setup is complete
 * @returns true if setup is complete (admin role and admin user exist)
 * Returns false on any error (including fresh database)
 */
export async function isSetupComplete(): Promise<boolean> {
  try {
    await connectDB();
    
    // Check if any roles exist at all (quick check for fresh database)
    const anyRole = await Role.findOne({});
    if (!anyRole) {
      // Fresh database - no roles exist
      return false;
    }
    
    // Check if admin role exists
    const adminRole = await Role.findOne({ name: 'admin' });
    if (!adminRole) {
      return false;
    }

    // Check if admin user exists
    const adminUser = await User.findOne({ role: adminRole._id });
    if (!adminUser) {
      return false;
    }

    return true;
  } catch (error) {
    // On any error (including connection errors, empty database, etc.), assume setup is needed
    console.error('Error checking setup status:', error);
    return false;
  }
}

/**
 * Require setup to be complete, redirect to setup page if not
 */
export async function requireSetupComplete() {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    const { redirect } = await import('next/navigation');
    redirect('/setup');
  }
}

