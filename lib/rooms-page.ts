import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Room from '@/models/Room';
import Queue from '@/models/Queue';
import Appointment from '@/models/Appointment';
import '@/models/Doctor';
import { getPermissionChecker } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeInTz, formatInTz } from '@/lib/tz';
import {
  ROOM_USAGE_DAYS,
  isRoomType,
  roomKey,
  roomKeys,
  roomStatusOf,
  type RoomOccupant,
  type RoomRow,
  type RoomsPageData,
  type TypedRoom,
} from '@/lib/rooms';

/** A clinic has a handful of rooms; the page loads them whole and filters on the client. */
const MAX_ROOMS = 500;
const TYPED_SHOWN = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

type Session = { userId: string; tenantId?: string; role: string; roleId?: string };

interface LeanRoom {
  _id: Types.ObjectId;
  name: string;
  roomNumber?: string;
  building?: string;
  floor?: number;
  roomType?: string;
  capacity?: number;
  equipment?: string[];
  amenities?: string[];
  status?: string;
  notes?: string;
  createdAt: Date;
}

/**
 * Everything /admin/rooms shows: every room, who is in each one now (from the queue), how often
 * bookings name it (the booking's room is free text, matched by name or number), consultations
 * finished in it, and the room names typed on bookings that match nothing on the list.
 */
export async function loadRoomsPage(session: Session): Promise<RoomsPageData> {
  if (!session.tenantId || !Types.ObjectId.isValid(session.tenantId)) throw new Error('No clinic on this session');
  const tenantId = new Types.ObjectId(session.tenantId);
  await connectDB();

  const now = new Date();
  const [check, settings, tz] = await Promise.all([getPermissionChecker(session), getSettings(String(tenantId)), getTenantTimezone(tenantId)]);
  const today = dayRangeInTz(now, tz);
  const since = new Date(today.start.getTime() - ROOM_USAGE_DAYS * DAY_MS);

  const [rooms, live, finished, history, bookings] = await Promise.all([
    Room.find({ tenantId })
      .select('name roomNumber building floor roomType capacity equipment amenities status notes createdAt')
      .sort({ name: 1 })
      .limit(MAX_ROOMS)
      .lean<LeanRoom[]>(),
    Queue.find({ tenantId, room: { $ne: null }, status: { $in: ['in-progress', 'waiting'] } })
      .select('room status queueNumber startedAt doctor')
      .populate({ path: 'doctor', select: 'firstName lastName', match: { tenantId } })
      .lean<{ room: Types.ObjectId; status: string; queueNumber: string; startedAt?: Date; doctor?: { firstName?: string; lastName?: string } | null }[]>(),
    Queue.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { tenantId, room: { $ne: null }, status: 'completed', completedAt: { $gte: since } } },
      { $group: { _id: '$room', n: { $sum: 1 } } },
    ]),
    Queue.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { tenantId, room: { $ne: null } } },
      { $group: { _id: '$room', n: { $sum: 1 } } },
    ]),
    Appointment.aggregate<{ _id: string; label: string; past: number; today: number; ahead: number }>([
      { $match: { tenantId, appointmentDate: { $gte: since }, status: { $ne: 'cancelled' }, room: { $type: 'string', $nin: ['', null] } } },
      {
        $group: {
          _id: { $toLower: { $trim: { input: '$room' } } },
          label: { $first: { $trim: { input: '$room' } } },
          past: { $sum: { $cond: [{ $lt: ['$appointmentDate', today.start] }, 1, 0] } },
          today: { $sum: { $cond: [{ $and: [{ $gte: ['$appointmentDate', today.start] }, { $lte: ['$appointmentDate', today.end] }] }, 1, 0] } },
          ahead: { $sum: { $cond: [{ $gt: ['$appointmentDate', today.end] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const doctorName = (d?: { firstName?: string; lastName?: string } | null) => {
    const n = [d?.firstName, d?.lastName].filter(Boolean).join(' ');
    return n ? `Dr. ${n}` : null;
  };
  const inUse = new Map<string, RoomOccupant[]>();
  const waiting = new Map<string, number>();
  for (const q of live) {
    const id = String(q.room);
    if (q.status === 'in-progress') {
      inUse.set(id, [...(inUse.get(id) ?? []), { queueNumber: q.queueNumber, doctor: doctorName(q.doctor), since: q.startedAt ? formatInTz(q.startedAt, 'h:mm a', tz) : null }]);
    } else waiting.set(id, (waiting.get(id) ?? 0) + 1);
  }
  const consults = new Map(finished.map((f) => [String(f._id), f.n]));
  const used = new Map(history.map((h) => [String(h._id), h.n]));

  // Bookings write the room as text; collapse spacing so "Room  101" and "room 101" meet.
  const booked = new Map<string, { label: string; past: number; today: number; ahead: number }>();
  for (const b of bookings) {
    const key = roomKey(b._id);
    const cur = booked.get(key);
    booked.set(key, cur ? { ...cur, past: cur.past + b.past, today: cur.today + b.today, ahead: cur.ahead + b.ahead } : { label: b.label, past: b.past, today: b.today, ahead: b.ahead });
  }
  const claimed = new Set<string>();

  const rows: RoomRow[] = rooms.map((r) => {
    const roomNumber = r.roomNumber?.trim() || null;
    const counts = { past: 0, today: 0, ahead: 0 };
    for (const key of new Set(roomKeys({ name: r.name, roomNumber }))) {
      const b = booked.get(key);
      if (!b || claimed.has(key)) continue;
      claimed.add(key);
      counts.past += b.past;
      counts.today += b.today;
      counts.ahead += b.ahead;
    }
    const id = String(r._id);
    return {
      _id: id,
      name: r.name,
      roomNumber,
      building: r.building?.trim() || null,
      floor: typeof r.floor === 'number' ? r.floor : null,
      roomType: isRoomType(r.roomType) ? r.roomType : 'other',
      capacity: typeof r.capacity === 'number' && r.capacity > 0 ? r.capacity : null,
      equipment: (r.equipment ?? []).filter(Boolean),
      amenities: (r.amenities ?? []).filter(Boolean),
      status: roomStatusOf(r.status),
      notes: r.notes?.trim() || null,
      createdAt: new Date(r.createdAt).toISOString(),
      inUse: inUse.get(id) ?? [],
      waiting: waiting.get(id) ?? 0,
      booked: counts,
      consults: consults.get(id) ?? 0,
      history: used.get(id) ?? 0,
    };
  });

  const typed: TypedRoom[] = [...booked.entries()]
    .filter(([key]) => !claimed.has(key))
    .map(([, b]) => ({ label: b.label, bookings: b.past + b.today + b.ahead }))
    .sort((a, b) => b.bookings - a.bookings || a.label.localeCompare(b.label))
    .slice(0, TYPED_SHOWN);

  const automation = (settings as { automationSettings?: { autoQueueOptimization?: boolean } }).automationSettings;
  return {
    rows,
    typed,
    bookingsWithRoom: bookings.reduce((n, b) => n + b.past + b.today + b.ahead, 0),
    roomedConsults: finished.reduce((n, f) => n + f.n, 0),
    autoAssign: settings.queueSettings?.autoAssignRooms === true,
    queueOptimisation: automation?.autoQueueOptimization === true,
    can: { write: check('rooms', 'write') },
    now: now.toISOString(),
  };
}
