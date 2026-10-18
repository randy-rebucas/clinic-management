import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { loadAccount } from '@/lib/account';
import ProfileClient from '@/components/account/ProfileClient';

export const metadata = { title: 'Your profile · My Clinic Software' };

export default async function ProfilePage() {
  const session = await verifySession();
  if (!session) redirect('/login');

  const account = await loadAccount(session.userId);
  if (!account) redirect('/login');

  return <ProfileClient initial={account} />;
}
