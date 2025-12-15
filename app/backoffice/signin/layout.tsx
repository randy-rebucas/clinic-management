import { verifySuperAdminSession } from '@/app/lib/dal';
import { redirect } from 'next/navigation';

/**
 * Signin page layout - redirects to overview if already authenticated
 * This layout is only applied to the signin page
 */
export default async function SigninLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    // If already authenticated, redirect to overview
    const session = await verifySuperAdminSession();
    if (session) {
      redirect('/overview');
    }
  } catch (error) {
    // If there's an error checking session, allow access to signin page
    // This prevents redirect loops
  }

  return <>{children}</>;
}

