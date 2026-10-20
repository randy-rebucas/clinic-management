import { requirePagePermission } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { STAFF_SENDER_ROLES } from '@/lib/notify';
import NotificationsPageClient from '@/components/NotificationsPageClient';

export default async function NotificationsPage() {
  // Require permission to read notifications
  await requirePagePermission('notifications', 'read');
  const session = await verifySession();

  // Doctors and admins can notify colleagues (not from a read-only platform view)
  return <NotificationsPageClient canSend={!!session && STAFF_SENDER_ROLES.includes(session.role) && !session.imp} />;
}
