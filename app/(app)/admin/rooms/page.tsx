import { redirect } from 'next/navigation';
import { requirePagePermission } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import { loadRoomsPage } from '@/lib/rooms-page';
import { isRoomShow, isRoomType } from '@/lib/rooms';
import RoomsPageClient from '@/components/admin/RoomsPageClient';

export const dynamic = 'force-dynamic';

/** Whoever may change rooms (administrators and owners, and anyone granted rooms:write). */
export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; type?: string }>;
}) {
  await requirePagePermission('rooms', 'write');
  const session = await verifySession();
  if (!session) redirect('/login');
  const { show, type } = await searchParams;

  const data = await loadRoomsPage(session);
  return <RoomsPageClient data={data} initialShow={isRoomShow(show) ? show : 'all'} initialType={isRoomType(type) ? type : ''} />;
}
