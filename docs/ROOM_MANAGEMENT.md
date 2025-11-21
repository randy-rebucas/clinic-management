# Room Management Guide

This guide explains the Room Management system for tracking and managing clinic rooms.

## Overview

The Room Management system allows you to:
- Track room availability and status
- Manage room schedules
- Assign rooms to appointments
- Filter appointments by room

## Room Model

Each room has the following properties:

- **name**: Unique room identifier (e.g., "Room 101", "Consultation Room A")
- **roomNumber**: Optional numeric identifier
- **floor**: Floor number
- **building**: Building name/location
- **roomType**: Type of room (consultation, examination, procedure, surgery, other)
- **capacity**: Maximum number of people
- **equipment**: List of available equipment
- **amenities**: List of amenities
- **status**: Current status (available, occupied, maintenance, unavailable)
- **schedule**: Weekly availability schedule
- **availabilityOverrides**: Date-specific availability changes

## API Endpoints

### Get All Rooms
```
GET /api/rooms
Query Parameters:
  - roomType: Filter by room type
  - status: Filter by status
  - available: true/false - Filter by availability
```

### Get Single Room
```
GET /api/rooms/[id]
```

### Create Room
```
POST /api/rooms
Body: {
  name: string (required),
  roomNumber?: string,
  floor?: number,
  building?: string,
  roomType: 'consultation' | 'examination' | 'procedure' | 'surgery' | 'other',
  capacity?: number,
  equipment?: string[],
  amenities?: string[],
  status: 'available' | 'occupied' | 'maintenance' | 'unavailable',
  notes?: string,
  schedule?: Array<{
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    isAvailable: boolean
  }>
}
```

### Update Room
```
PUT /api/rooms/[id]
Body: { ...room fields to update }
```

### Delete Room
```
DELETE /api/rooms/[id]
```

## Usage in Appointments

When creating or updating appointments, you can specify a room:

```json
{
  "patient": "patient_id",
  "doctor": "doctor_id",
  "appointmentDate": "2024-01-15",
  "appointmentTime": "10:00",
  "room": "Room 101"
}
```

## Room Status Management

Rooms can have the following statuses:

- **available**: Room is free and ready for use
- **occupied**: Room is currently in use
- **maintenance**: Room is under maintenance
- **unavailable**: Room is temporarily unavailable

Update room status as needed:
```json
PUT /api/rooms/[id]
{
  "status": "occupied"
}
```

## Integration with Appointments

The appointment system supports room filtering:

- Filter appointments by room: `GET /api/appointments?room=Room%20101`
- Calendar view can filter by room
- Room information is displayed in appointment lists

## Best Practices

1. **Room Naming**: Use consistent naming conventions (e.g., "Room 101", "Consultation A")
2. **Status Updates**: Keep room status updated to reflect current availability
3. **Scheduling**: Set up weekly schedules for rooms that have specific availability
4. **Maintenance**: Mark rooms as "maintenance" when they need repairs
5. **Capacity**: Set appropriate capacity limits for each room type

## Future Enhancements

Potential additions:
- Room booking calendar view
- Equipment tracking and maintenance schedules
- Room utilization analytics
- Automatic status updates based on appointments
- Room conflict detection

