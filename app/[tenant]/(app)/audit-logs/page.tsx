import { getUser } from '@/app/lib/dal';
import { redirect } from 'next/navigation';
import AuditLogsClient from '@/components/AuditLogsClient';

export default async function AuditLogsPage() {
  const user = await getUser();
  
  if (!user || !('role' in user)) {
    redirect('/login');
  }

  // Only admins can access audit logs
  if (user.role !== 'admin') {
    redirect('/dashboard');
  }

  const safeUser = JSON.parse(JSON.stringify(user));
  return <AuditLogsClient user={safeUser} />;
}

