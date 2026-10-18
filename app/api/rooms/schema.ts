import { z } from 'zod';
import { zShortText } from '@/lib/api/validate';
import { ROOM_STATUSES, ROOM_TYPES } from '@/lib/rooms';

const list = z.array(zShortText.min(1)).max(100);

const roomFields = {
  name: zShortText.min(1, 'Enter the room’s name.'),
  roomNumber: zShortText.optional(),
  building: zShortText.optional(),
  floor: z.number().int().min(-10).max(300).optional(),
  roomType: z.enum(ROOM_TYPES),
  capacity: z.number().int().min(1).max(1000).optional(),
  equipment: list.optional(),
  amenities: list.optional(),
  // "occupied" is worked out from the queue; it can't be set by hand any more.
  status: z.enum(ROOM_STATUSES).optional(),
  notes: z.string().trim().max(5000).optional(),
};

export const roomCreateSchema = z.object(roomFields);

/** On update, '' (and null for numbers) clears an optional field. */
export const roomUpdateSchema = z.object({
  ...roomFields,
  name: roomFields.name.optional(),
  roomType: roomFields.roomType.optional(),
  floor: roomFields.floor.nullable(),
  capacity: roomFields.capacity.nullable(),
});

/** Optional fields that a blank value removes. */
export const ROOM_CLEARABLE = ['roomNumber', 'building', 'floor', 'capacity', 'notes'] as const;
