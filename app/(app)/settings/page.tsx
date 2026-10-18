import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { loadAccount, loadAccountActivity } from '@/lib/account';
import SettingsClient from '@/components/account/SettingsClient';

export const metadata = { title: 'Sign-in & security · My Clinic Software' };

export default async function SettingsPage() {
  const session = await verifySession();
  if (!session) redirect('/login');

  const [account, activity] = await Promise.all([
    loadAccount(session.userId),
    loadAccountActivity(session.userId),
  ]);
  if (!account) redirect('/login');

  return <SettingsClient email={account.email} totpEnabled={account.totpEnabled} activity={activity} />;
}
