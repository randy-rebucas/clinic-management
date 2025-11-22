import { getUser } from '@/app/lib/dal';
import { redirect } from 'next/navigation';
import SettingsPageClient from '@/components/SettingsPageClient';

export default async function SettingsPage() {
  const user = await getUser();
  
  if (!user || !('role' in user)) {
    redirect('/login');
  }

  return <SettingsPageClient user={user as { role: string; [key: string]: any }} />;
}

