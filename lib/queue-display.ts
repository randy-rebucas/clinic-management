import 'server-only';
import { Types } from 'mongoose';
import QRCode from 'qrcode';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import '@/models/Doctor';
import '@/models/Room';
import { verifySession } from '@/app/lib/dal';
import { checkInQr } from '@/lib/clinic-checkin';
import { QUEUE_SORT, shortQueueNumber } from '@/lib/queue-order';
import { getSettings } from '@/lib/settings';

/** The most the board fits at TV size; the rest of the line is a count. */
export const NOW_SERVING_MAX = 6;
export const NEXT_UP_MAX = 4;
/** A guard on the read only: no clinic has this many people checked in at once. */
const ACTIVE_MAX = 200;

/** One patient as the waiting room sees them: a number and initials, never a name. */
export interface DisplayEntry {
  id: string;
  number: string;
  initials: string;
  doctor: string | null;
  room: string | null;
}

export interface QueueDisplayData {
  nowServing: DisplayEntry[];
  nextUp: DisplayEntry[];
  /** Everyone checked in and not yet called, including those past NEXT_UP_MAX. */
  waiting: number;
  /** The rotating self check-in QR as a data URL, when the clinic allows self check-in. */
  checkInImage: string | null;
  /** What the clinic plays beside the queue; the board is the queue alone when both are empty. */
  media: { videos: string[]; ads: string[] };
}

interface ActiveEntry {
  queueNumber: string;
  patientName?: string | null;
  status: string;
  startedAt?: Date | string | null;
  doctor?: { lastName?: string | null } | null;
  room?: { name?: string | null; roomNumber?: string | null } | null;
}

/** "Juan Dela Cruz" -> "J. D. C." so the public screen never shows full names. */
export function initials(name: unknown): string {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w[0].toUpperCase()}.`)
    .join(' ');
}

function toDisplay(entry: ActiveEntry): DisplayEntry {
  return {
    id: entry.queueNumber,
    number: shortQueueNumber(entry.queueNumber),
    initials: initials(entry.patientName),
    doctor: entry.doctor?.lastName ? `Dr. ${entry.doctor.lastName}` : null,
    room: entry.room?.name || entry.room?.roomNumber || null,
  };
}

/** Split the active line, in call order, into who was called (latest first) and who is next. */
export function shapeQueueDisplay(entries: ActiveEntry[]): Pick<QueueDisplayData, 'nowServing' | 'nextUp' | 'waiting'> {
  const calledAt = (e: ActiveEntry) => (e.startedAt ? new Date(e.startedAt).getTime() : 0);
  const called = entries.filter((e) => e.status === 'in-progress').sort((a, b) => calledAt(b) - calledAt(a));
  const waiting = entries.filter((e) => e.status === 'waiting');
  return {
    nowServing: called.slice(0, NOW_SERVING_MAX).map(toDisplay),
    nextUp: waiting.slice(0, NEXT_UP_MAX).map(toDisplay),
    waiting: waiting.length,
  };
}

/**
 * Anonymous viewers see the board only when the clinic enabled
 * queueSettings.displayQueuePublicly; signed-in staff of the clinic always can.
 */
export async function canViewQueueDisplay(tenantId: string): Promise<boolean> {
  const settings = await getSettings(tenantId);
  if (settings?.queueSettings?.displayQueuePublicly) return true;
  const session = await verifySession();
  return !!session && session.tenantId === tenantId;
}

/** The board's data, one read of the active line. Check canViewQueueDisplay first. */
export async function loadQueueDisplay(
  tenantId: string,
  filter: { doctorId?: string | null; roomId?: string | null } = {}
): Promise<QueueDisplayData> {
  await connectDB();
  const tenantObjectId = new Types.ObjectId(tenantId);
  const query: Record<string, unknown> = {
    tenantId: tenantObjectId,
    status: { $in: ['waiting', 'in-progress'] },
    checkedIn: true,
  };
  if (filter.doctorId && Types.ObjectId.isValid(filter.doctorId)) query.doctor = new Types.ObjectId(filter.doctorId);
  if (filter.roomId && Types.ObjectId.isValid(filter.roomId)) query.room = new Types.ObjectId(filter.roomId);

  const [entries, settings] = await Promise.all([
    Queue.find(query)
      .select('queueNumber patientName doctor room status startedAt')
      .populate({ path: 'doctor', select: 'lastName', match: { tenantId: tenantObjectId } })
      .populate({ path: 'room', select: 'name roomNumber', match: { tenantId: tenantObjectId } })
      .sort(QUEUE_SORT)
      .limit(ACTIVE_MAX)
      .lean<ActiveEntry[]>(),
    getSettings(tenantId),
  ]);

  const checkInImage = settings?.queueSettings?.patientSelfCheckIn
    ? await QRCode.toDataURL(checkInQr(tenantId).qrData, { errorCorrectionLevel: 'M', width: 360, margin: 1 })
    : null;

  const media = {
    videos: Array.from<string>(settings?.queueSettings?.displayVideos ?? []),
    ads: Array.from<string>(settings?.queueSettings?.displayAds ?? []),
  };

  return { ...shapeQueueDisplay(entries), checkInImage, media };
}
