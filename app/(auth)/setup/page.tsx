import { isSetupComplete } from '@/lib/setup';
import { redirect } from 'next/navigation';
import SetupClient from '@/components/SetupClient';

export default async function SetupPage() {
  // If setup is already complete, redirect to login
  const setupComplete = await isSetupComplete();
  if (setupComplete) {
    redirect('/login');
  }

  return <SetupClient />;
}

