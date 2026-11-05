import 'server-only';
import { Types } from 'mongoose';
import QRCode from 'qrcode';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import '@/models/Doctor';
import '@/models/Patient';
import '@/models/Room';
import { verifySession } from '@/app/lib/dal';
import { checkInQr } from '@/lib/clinic-checkin';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { QUEUE_SORT, shortQueueNumber } from '@/lib/queue-order';
import type { DisplayNameStyle } from '@/lib/queue-media';
import { consultMinutesByDoctor, estimateWaits } from '@/lib/queue-wait';
import { getSettings } from '@/lib/settings';
import { dayRangeInTz } from '@/lib/tz';

/** The most the board fits at TV size; the rest of the line is a count. */
export const NOW_SERVING_MAX = 6;
export const NEXT_UP_MAX = 10;
export const DOCTOR_LINES_MAX = 6;
const LINE_NEXT_MAX = 3;
/** A guard on the read only: no clinic has this many people checked in at once. */
const ACTIVE_MAX = 200;

/** Every screen in a clinic shares one read; a call can reach the room this much later. */
const BOARD_TTL_MS = 5_000;
/** The day's averages move slowly, and this is the board's only aggregate. */
const CONSULT_TTL_MS = 5 * 60_000;
const REMEMBERED_MAX = 200;

/** One patient as the waiting room sees them: a number and a short name, never a surname. */
export interface DisplayEntry {
  id: string;
  number: string;
  /** Shaped by the clinic's display name setting: "Juan D.", "J. D.", or empty for numbers only. */
  name: string;
  doctor: string | null;
  room: string | null;
  /** When this patient was called, for telling a new call from an old one. */
  calledAt: number | null;
  /** Minutes until their turn, for those still waiting. */
  waitMinutes: number | null;
}

/** One doctor's own line, when the clinic shows the board by doctor. */
export interface DoctorLine {
  id: string;
  doctor: string;
  serving: DisplayEntry | null;
  next: DisplayEntry[];
  waiting: number;
}

export interface QueueDisplayData {
  nowServing: DisplayEntry[];
  nextUp: DisplayEntry[];
  /** Everyone checked in and not yet called, including those past NEXT_UP_MAX. */
  waiting: number;
  /** Set when the clinic groups the board by doctor. */
  lines: DoctorLine[] | null;
  /** Doctors with patients past DOCTOR_LINES_MAX. */
  moreDoctors: number;
  /** Outside opening hours with nobody in line. */
  closed: boolean;
  /** The rotating self check-in QR as a data URL, when the clinic allows self check-in. */
  checkInImage: string | null;
  /** What the clinic plays beside the queue; the board is the queue alone when both are empty. */
  media: { videos: string[]; ads: string[] };
  /** A message scrolling along the bottom of the screen. */
  ticker: string;
  /** Which deploy served this, so a screen left on for weeks can pick up a new one. */
  version: string | null;
}

interface ActiveEntry {
  _id?: unknown;
  queueNumber: string;
  patient?: { firstName?: string | null; lastName?: string | null } | null;
  patientName?: string | null;
  status: string;
  startedAt?: Date | string | null;
  doctor?: { _id?: unknown; lastName?: string | null } | null;
  room?: { name?: string | null; roomNumber?: string | null } | null;
}

interface OpeningDay {
  day: string;
  open?: string;
  close?: string;
  closed?: boolean;
}

interface ShapeOptions {
  names?: DisplayNameStyle;
  waits?: Map<ActiveEntry, { estimatedWaitTime: number }>;
  byDoctor?: boolean;
}

const words = (text: unknown) => String(text || '').split(/\s+/).filter(Boolean);

/**
 * "Juan" + "Dela Cruz" -> "Juan D." or "J. D.", so the public screen never shows a surname. The
 * patient record comes first: the cached full name can't say where a two-word first name ends,
 * so it is only the fallback, taking its first and last words.
 */
export function boardName(patient: ActiveEntry['patient'], cachedName?: string | null, style: DisplayNameStyle = 'first-initial'): string {
  if (style === 'number') return '';
  const cached = words(cachedName);
  const first = words(patient?.firstName).join(' ') || cached[0] || '';
  const last = words(patient?.lastName)[0] ?? (cached.length > 1 ? cached[cached.length - 1] : '');
  if (style === 'initials') {
    return [first, last]
      .filter(Boolean)
      .map((w) => `${w[0].toUpperCase()}.`)
      .join(' ');
  }
  return last ? `${first} ${last[0].toUpperCase()}.`.trim() : first;
}

/**
 * Whether the clinic is shut at this moment by its opening hours. Anything the hours can't answer
 * (none set, a day missing, closing past midnight) counts as open: a wrongly dark screen is worse.
 */
export function isClosedNow(hours: OpeningDay[] | null | undefined, timeZone: string, at: Date = new Date()): boolean {
  if (!hours?.length) return false;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const today = hours.find((h) => String(h.day).toLowerCase() === part('weekday').toLowerCase());
  if (!today) return false;
  if (today.closed) return true;
  if (!today.open || !today.close || today.close <= today.open) return false;
  const now = `${part('hour')}:${part('minute')}`;
  return now < today.open || now >= today.close;
}

const calledAt = (e: ActiveEntry) => (e.startedAt ? new Date(e.startedAt).getTime() : 0);

function doctorLines(called: ActiveEntry[], waiting: ActiveEntry[], show: (e: ActiveEntry) => DisplayEntry): DoctorLine[] {
  const lines = new Map<string, DoctorLine>();
  const lineOf = (e: ActiveEntry) => {
    const id = String(e.doctor?._id ?? 'none');
    const line = lines.get(id) ?? { id, doctor: e.doctor?.lastName ? `Dr. ${e.doctor.lastName}` : 'Any doctor', serving: null, next: [], waiting: 0 };
    lines.set(id, line);
    return line;
  };
  for (const e of called) {
    const line = lineOf(e);
    line.serving ??= show(e);
  }
  for (const e of waiting) {
    const line = lineOf(e);
    line.waiting += 1;
    if (line.next.length < LINE_NEXT_MAX) line.next.push(show(e));
  }
  return [...lines.values()].sort((a, b) => Number(a.id === 'none') - Number(b.id === 'none') || a.doctor.localeCompare(b.doctor));
}

/** Split the active line, in call order, into who was called (latest first) and who is next. */
export function shapeQueueDisplay(
  entries: ActiveEntry[],
  { names, waits, byDoctor }: ShapeOptions = {}
): Pick<QueueDisplayData, 'nowServing' | 'nextUp' | 'waiting' | 'lines' | 'moreDoctors'> {
  const show = (entry: ActiveEntry): DisplayEntry => ({
    id: entry.queueNumber,
    number: shortQueueNumber(entry.queueNumber),
    name: boardName(entry.patient, entry.patientName, names),
    doctor: entry.doctor?.lastName ? `Dr. ${entry.doctor.lastName}` : null,
    room: entry.room?.name || entry.room?.roomNumber || null,
    calledAt: calledAt(entry) || null,
    waitMinutes: waits?.get(entry)?.estimatedWaitTime ?? null,
  });
  const called = entries.filter((e) => e.status === 'in-progress').sort((a, b) => calledAt(b) - calledAt(a));
  const waiting = entries.filter((e) => e.status === 'waiting');
  const lines = byDoctor ? doctorLines(called, waiting, show) : null;
  return {
    nowServing: called.slice(0, NOW_SERVING_MAX).map(show),
    nextUp: waiting.slice(0, NEXT_UP_MAX).map(show),
    waiting: waiting.length,
    lines: lines && lines.slice(0, DOCTOR_LINES_MAX),
    moreDoctors: Math.max(0, (lines?.length ?? 0) - DOCTOR_LINES_MAX),
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

const boards = new Map<string, { at: number; value: Promise<QueueDisplayData> }>();
const consults = new Map<string, { at: number; value: Promise<Map<string, number>> }>();

/** Per instance, like the settings cache. Holds the promise so screens polling together share a read. */
function remembered<T>(store: Map<string, { at: number; value: Promise<T> }>, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttl) return hit.value;
  if (store.size >= REMEMBERED_MAX) store.clear();
  const value = load();
  store.set(key, { at: now, value });
  value.catch(() => store.delete(key));
  return value;
}

async function readBoard(tenantId: string, doctorId: string, roomId: string): Promise<QueueDisplayData> {
  await connectDB();
  const tenantObjectId = new Types.ObjectId(tenantId);
  const query: Record<string, unknown> = {
    tenantId: tenantObjectId,
    status: { $in: ['waiting', 'in-progress'] },
    checkedIn: true,
  };
  if (doctorId) query.doctor = new Types.ObjectId(doctorId);
  if (roomId) query.room = new Types.ObjectId(roomId);

  const [entries, settings, timeZone] = await Promise.all([
    Queue.find(query)
      .select('queueNumber patient patientName doctor room status startedAt')
      .populate({ path: 'patient', select: 'firstName lastName', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'doctor', select: 'lastName', match: { tenantId: tenantObjectId } })
      .populate({ path: 'room', select: 'name roomNumber', match: { tenantId: tenantObjectId } })
      .sort(QUEUE_SORT)
      .limit(ACTIVE_MAX)
      .lean<ActiveEntry[]>(),
    getSettings(tenantId),
    getTenantTimezone(tenantId),
  ]);

  const { start: todayStart } = dayRangeInTz(new Date(), timeZone);
  // Keyed on who is in consult, so a finished consult shows at once, on every server instance.
  const inConsult = entries.filter((e) => e.status === 'in-progress').map((e) => String(e._id)).sort().join(',');
  const averages = await remembered(consults, `${tenantId}|${todayStart.getTime()}|${inConsult}`, CONSULT_TTL_MS, () => consultMinutesByDoctor(tenantObjectId, todayStart));
  const waits = estimateWaits(entries, averages, settings?.appointmentSettings?.defaultDuration || 15);

  const queueSettings = settings?.queueSettings;
  const checkInImage = queueSettings?.patientSelfCheckIn
    ? await QRCode.toDataURL(checkInQr(tenantId).qrData, { errorCorrectionLevel: 'M', width: 360, margin: 1 })
    : null;

  return {
    ...shapeQueueDisplay(entries, {
      names: queueSettings?.displayNames,
      waits,
      byDoctor: !!queueSettings?.displayByDoctor && !doctorId && !roomId,
    }),
    closed: entries.length === 0 && isClosedNow(settings?.businessHours, timeZone),
    checkInImage,
    media: {
      videos: Array.from<string>(queueSettings?.displayVideos ?? []),
      ads: Array.from<string>(queueSettings?.displayAds ?? []),
    },
    ticker: String(queueSettings?.displayTicker ?? ''),
    version: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || null,
  };
}

/** The board's data. Check canViewQueueDisplay first: the read is shared, the permission isn't. */
export function loadQueueDisplay(tenantId: string, filter: { doctorId?: string | null; roomId?: string | null } = {}): Promise<QueueDisplayData> {
  const valid = (id?: string | null) => (id && Types.ObjectId.isValid(id) ? id : '');
  const doctorId = valid(filter.doctorId);
  const roomId = valid(filter.roomId);
  return remembered(boards, `${tenantId}|${doctorId}|${roomId}`, BOARD_TTL_MS, () => readBoard(tenantId, doctorId, roomId));
}
