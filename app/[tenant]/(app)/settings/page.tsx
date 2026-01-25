import { getUser } from '@/app/lib/dal';
import { redirect } from 'next/navigation';
import SettingsPageClient from '@/components/SettingsPageClient';

export default async function SettingsPage() {
  const user = await getUser();
  
  if (!user || !('role' in user)) {
    redirect('/login');
  }

  // Ensure user is a plain object before passing to Client Component
  const safeUser = user ? JSON.parse(JSON.stringify(user)) : null;
  return <SettingsPageClient user={safeUser as { role: string; [key: string]: any }} />;
}

