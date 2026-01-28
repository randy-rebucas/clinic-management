import { requirePagePermission } from '@/app/lib/auth-helpers';
import NotificationsPageClient from '@/components/NotificationsPageClient';

export default async function NotificationsPage() {
  // Require permission to read notifications
  await requirePagePermission('notifications', 'read');

  return <NotificationsPageClient />;
}

