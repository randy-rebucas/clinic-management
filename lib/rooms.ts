/**
 * Rooms as /admin/rooms shows them. Client-safe: no model imports.
 *
 * A room's stored status says whether it may be used (open, under maintenance, closed). Whether
 * someone is in it right now is never stored by hand: it is worked out from the queue (a patient
 * in consultation whose queue entry holds the room). The old "occupied" value, set by hand and
 * never cleared, reads as open.
 */

export const ROOM_TYPES = ['consultation', 'examination', 'procedure', 'surgery', 'other'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];
export const isRoomType = (v: unknown): v is RoomType => typeof v === 'string' && (ROOM_TYPES as readonly string[]).includes(v);

export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  consultation: 'Consultation',
  examination: 'Examination',
  procedure: 'Procedure',
  surgery: 'Surgery',
  other: 'Other',
};

/** Statuses staff can set. `occupied` is stored on older rooms only. */
export const ROOM_STATUSES = ['available', 'maintenance', 'unavailable'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const ROOM_STATUS: Record<RoomStatus, { label: string; hint: string }> = {
  available: { label: 'Open', hint: 'Patients can be seen here.' },
  maintenance: { label: 'Under maintenance', hint: 'Out of use for now, back once it’s fixed.' },
  unavailable: { label: 'Closed', hint: 'Not used until it’s opened again.' },
};

/** Stored value → what staff can set ("occupied" was set by hand; it means open). */
export const roomStatusOf = (v: unknown): RoomStatus => (v === 'maintenance' || v === 'unavailable' ? v : 'available');

/** What a row says: the stored status, with "in use now" worked out from the queue. */
export type RoomState = 'in-use' | 'free' | 'maintenance' | 'unavailable';

export const ROOM_STATE: Record<RoomState, { label: string; badge: string }> = {
  'in-use': { label: 'In use now', badge: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30' },
  free: { label: 'Free', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  maintenance: { label: 'Under maintenance', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  unavailable: { label: 'Closed', badge: 'bg-white text-gray-600 ring-gray-300' },
};

export const ROOM_SHOWS = ['all', 'in-use', 'free', 'maintenance', 'unavailable', 'unbooked'] as const;
export type RoomShow = (typeof ROOM_SHOWS)[number];
export const isRoomShow = (v: unknown): v is RoomShow => typeof v === 'string' && (ROOM_SHOWS as readonly string[]).includes(v);

/** Days of bookings the page looks back over. */
export const ROOM_USAGE_DAYS = 30;

export const ROOM_SHOW_LABEL: Record<RoomShow, string> = {
  all: 'Every room',
  'in-use': 'In use now',
  free: 'Free',
  maintenance: 'Under maintenance',
  unavailable: 'Closed',
  unbooked: `Not booked in ${ROOM_USAGE_DAYS} days`,
};

/** "Room 101", "room101", " Consult A " → one comparable key. */
export const roomKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Every way a booking might write this room: its name, its number, "Room <number>". */
export function roomKeys(room: { name: string; roomNumber: string | null }): string[] {
  const keys = [roomKey(room.name)];
  if (room.roomNumber) {
    const n = roomKey(room.roomNumber);
    keys.push(n, `room ${n}`, `rm ${n}`, `room${n}`);
  }
  return keys.filter(Boolean);
}

export interface RoomOccupant {
  /** Queue number only: the room page doesn't need to say who the patient is. */
  queueNumber: string;
  doctor: string | null;
  /** Clinic-local start time, e.g. "9:41 AM". */
  since: string | null;
}

export interface RoomRow {
  _id: string;
  name: string;
  roomNumber: string | null;
  building: string | null;
  floor: number | null;
  roomType: RoomType;
  capacity: number | null;
  equipment: string[];
  amenities: string[];
  status: RoomStatus;
  notes: string | null;
  createdAt: string;
  /** Patients in consultation in this room right now (normally one). */
  inUse: RoomOccupant[];
  /** Waiting patients already given this room. */
  waiting: number;
  /** Bookings that name this room: the last 30 days, today, and still to come (cancelled left out). */
  booked: { past: number; today: number; ahead: number };
  /** Consultations finished in this room in the last 30 days (from the queue). */
  consults: number;
  /** Queue entries that ever held it; a room with history can't be deleted. */
  history: number;
}

/** A room written on bookings that matches nothing on the list. */
export interface TypedRoom {
  label: string;
  bookings: number;
}

export interface RoomsPageData {
  rows: RoomRow[];
  typed: TypedRoom[];
  /** Bookings in the window that name any room at all. */
  bookingsWithRoom: number;
  /** Queue entries that were given a room in the window. */
  roomedConsults: number;
  autoAssign: boolean;
  queueOptimisation: boolean;
  can: { write: boolean };
  now: string;
}

export const roomState = (r: Pick<RoomRow, 'status' | 'inUse'>): RoomState =>
  r.status !== 'available' ? r.status : r.inUse.length > 0 ? 'in-use' : 'free';

/** "Main building, floor 2" / "Floor 2" / "Ground floor". */
export function whereLine(r: Pick<RoomRow, 'building' | 'floor'>) {
  const floor = r.floor === null ? null : r.floor === 0 ? 'ground floor' : `floor ${r.floor}`;
  const parts = [r.building, floor].filter(Boolean) as string[];
  const s = parts.join(', ');
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}
