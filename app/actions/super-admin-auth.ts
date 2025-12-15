'use server';

import { redirect } from 'next/navigation';
import { createSuperAdminSession, deleteSuperAdminSession } from '@/app/lib/dal';
import { verifySuperAdminCredentials, SUPER_ADMIN_CONFIG } from '@/lib/super-admin';

export interface SuperAdminLoginState {
  error?: string;
  success?: boolean;
}

/**
 * Super-admin login action
 */
export async function superAdminLogin(
  state: SuperAdminLoginState,
  formData: FormData
): Promise<SuperAdminLoginState> {
  try {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
      return { error: 'Email and password are required' };
    }

    // Verify credentials
    if (!verifySuperAdminCredentials(email, password)) {
      return { error: 'Invalid credentials' };
    }

    // Create super-admin session
    await createSuperAdminSession(email);

    // Redirect to backoffice overview
    redirect('/overview');
  } catch (error: any) {
    console.error('Super-admin login error:', error);
    
    // If redirect was called, re-throw it
    if (error.message?.includes('NEXT_REDIRECT')) {
      throw error;
    }
    
    return { error: 'Login failed. Please try again.' };
  }
}

/**
 * Super-admin logout action
 */
export async function superAdminLogout(): Promise<void> {
  await deleteSuperAdminSession();
  redirect('/signin');
}

