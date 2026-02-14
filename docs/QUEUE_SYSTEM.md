# Queue & Waiting Room Management Guide

Complete guide for managing patient queues, waiting room displays, and real-time queue updates in MyClinicSoft.

---

## Table of Contents

1. [Overview](#overview)
2. [Queue Model](#queue-model)
3. [Check-In Process](#check-in-process)
4. [Queue Management](#queue-management)
5. [Queue Display System](#queue-display-system)
6. [Real-Time Updates](#real-time-updates)
7. [QR Code Check-In](#qr-code-check-in)
8. [API Reference](#api-reference)
9. [UI Components](#ui-components)
10. [Best Practices](#best-practices)

---

## Overview

MyClinicSoft provides comprehensive queue management including:
- **Multiple queue types**: Appointment-based, walk-in, follow-up
- **Priority management**: Emergency, urgent, routine
- **Real-time updates**: WebSocket-based queue monitoring
- **QR code check-in**: Contactless patient check-in
- **Waiting room TV display**: Real-time queue on TV screens
- **Vitals capture**: Record vitals during check-in
- **Estimated wait times**: Dynamic calculation based on queue
- **Multi-doctor queues**: Separate queues per doctor or shared

### Queue Flow

```
Patient Arrival → Check-In → Waiting → Called → In Progress → Completed
                     ↓          ↓         ↓          ↓             ↓
                 [Vitals]  [TV Display] [SMS]  [Consultation]  [Billing]
```

---

## Queue Model

**File**: `models/Queue.ts`

```typescript
interface IQueue {
  // Identification
  tenantId?: ObjectId;
  queueNumber: string;               // Display number: "A001", "W005"
  queueType: 'appointment' | 'walk-in' | 'follow-up';
  
  // Patient
  patient: ObjectId;                 // → Patient
  patientName: string;               // Cached for display
  
  // Related Records
  appointment?: ObjectId;            // → Appointment (if from appointment)
  visit?: ObjectId;                  // → Visit (if consultation started)
  
  // Assignment
  doctor?: ObjectId;                 // → Doctor
  room?: ObjectId;                   // → Room
  
  // Queue Management
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  priority: number;                  // 0=highest, 1=normal, 2=low
  estimatedWaitTime?: number;        // Minutes (calculated)
  
  // Timestamps
  queuedAt: Date;                    // When added to queue
  calledAt?: Date;                   // When called
  startedAt?: Date;                  // Consultation started
  completedAt?: Date;                // Consultation completed
  
  // Check-In
  checkedIn: boolean;
  checkedInAt?: Date;
  checkInMethod?: 'manual' | 'qr_code' | 'kiosk';
  qrCode?: string;                   // QR code for self check-in
  
  // Vitals (captured at check-in)
  vitals?: {
    bp?: string;                     // "120/80"
    hr?: number;                     // Heart rate (bpm)
    rr?: number;                     // Respiratory rate
    tempC?: number;                  // Temperature
    spo2?: number;                   // Oxygen saturation (%)
    heightCm?: number;
    weightKg?: number;
    bmi?: number;
  };
  
  // Tracking
  consultationDuration?: number;     // Minutes
  completionNotes?: string;
  nextAction?: 'billing' | 'pharmacy' | 'lab' | 'checkout';
  notes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Check-In Process

### Manual Check-In (by Receptionist)

**API Endpoint**: `POST /api/queue`

```typescript
const checkInPatient = async (checkInData) => {
  const response = await fetch('/api/queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      patientId: '64p123...',
      appointmentId: '64a123...',        // If from appointment
      queueType: 'appointment',          // 'appointment', 'walk-in', 'follow-up'
      doctorId: '64d123...',
      priority: 0,                       // 0=high, 1=normal, 2=low
      vitals: {
        bp: '120/80',
        hr: 75,
        rr: 16,
        tempC: 36.8,
        spo2: 98,
        weightKg: 65,
        heightCm: 165
      }
    })
  });
  
  return await response.json();
};
```

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "64q123...",
    "queueNumber": "A001",
    "queueType": "appointment",
    "patient": {
      "_id": "64p123...",
      "firstName": "Maria",
      "lastName": "Santos",
      "patientCode": "PAT-000001"
    },
    "doctor": {
      "_id": "64d123...",
      "firstName": "Juan",
      "lastName": "Cruz"
    },
    "status": "waiting",
    "priority": 0,
    "queuedAt": "2024-02-14T09:00:00Z",
    "estimatedWaitTime": 15,
    "qrCode": "QUEUE-64q123...",
    "vitals": {
      "bp": "120/80",
      "hr": 75,
      "tempC": 36.8
    }
  }
}
```

### Walk-In Check-In

```typescript
const checkInWalkIn = async (patientId) => {
  const response = await fetch('/api/queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      patientId: patientId,
      queueType: 'walk-in',
      priority: 1,                       // Normal priority
      doctorId: null,                    // Will be assigned later
      vitals: {
        bp: '120/80',
        tempC: 36.5
      }
    })
  });
  
  return await response.json();
};
```

### Emergency/STAT Check-In

```typescript
const checkInEmergency = async (patientId) => {
  const response = await fetch('/api/queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      patientId: patientId,
      queueType: 'walk-in',
      priority: 0,                       // Highest priority
      doctorId: '64d123...',
      notes: 'EMERGENCY: Chest pain'
    })
  });
  
  return await response.json();
};
```

---

## Queue Management

### View Active Queue

**API Endpoint**: `GET /api/queue`

```typescript
const getActiveQueue = async (filters) => {
  const params = new URLSearchParams({
    status: filters.status || 'waiting,in-progress',  // Comma-separated
    doctorId: filters.doctorId || '',
    roomId: filters.roomId || ''
  });
  
  const response = await fetch(`/api/queue?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
};

// Example: Get all waiting patients
const waiting = await getActiveQueue({ status: 'waiting' });

// Example: Get queue for specific doctor
const doctorQueue = await getActiveQueue({ 
  doctorId: '64d123...',
  status: 'waiting,in-progress'
});
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "64q123...",
      "queueNumber": "A001",
      "patientName": "Maria Santos",
      "status": "waiting",
      "priority": 0,
      "estimatedWaitTime": 10,
      "position": 1,
      "queuedAt": "2024-02-14T09:00:00Z",
      "doctor": {
        "firstName": "Juan",
        "lastName": "Cruz"
      }
    },
    {
      "_id": "64q124...",
      "queueNumber": "A002",
      "patientName": "Juan Dela Cruz",
      "status": "waiting",
      "priority": 1,
      "estimatedWaitTime": 25,
      "position": 2,
      "queuedAt": "2024-02-14T09:05:00Z"
    }
  ]
}
```

### Call Next Patient

**API Endpoint**: `PATCH /api/queue/:id`

```typescript
const callNextPatient = async (queueId) => {
  const response = await fetch(`/api/queue/${queueId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      status: 'in-progress',
      calledAt: new Date(),
      roomId: '64r123...'              // Assign room
    })
  });
  
  return await response.json();
};
```

**Automatic Actions**:
- Update queue display (WebSocket broadcast)
- SMS notification to patient
- Room assignment displayed
- Timer starts for consultation duration

### Start Consultation

```typescript
const startConsultation = async (queueId) => {
  const response = await fetch(`/api/queue/${queueId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      startedAt: new Date()
    })
  });
  
  // Create Visit record
  const visit = await createVisit({
    patient: queue.patient,
    queueId: queueId,
    vitals: queue.vitals
  });
  
  // Link visit to queue
  await updateQueue(queueId, {
    visit: visit._id
  });
  
  return await response.json();
};
```

### Complete Consultation

```typescript
const completeConsultation = async (queueId, nextAction) => {
  const response = await fetch(`/api/queue/${queueId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      status: 'completed',
      completedAt: new Date(),
      nextAction: nextAction,          // 'billing', 'pharmacy', 'lab', 'checkout'
      completionNotes: 'Consultation completed, proceed to billing'
    })
  });
  
  return await response.json();
};
```

### Cancel/No-Show

```typescript
// Mark as no-show
const markNoShow = async (queueId) => {
  await updateQueue(queueId, {
    status: 'no-show',
    completedAt: new Date()
  });
};

// Cancel queue entry
const cancelQueue = async (queueId) => {
  await updateQueue(queueId, {
    status: 'cancelled',
    completedAt: new Date(),
    notes: 'Patient left before consultation'
  });
};
```

---

## Queue Display System

### TV Display Mode

**API Endpoint**: `GET /api/queue?display=true`

For waiting room TV displays:

```typescript
const getQueueDisplay = async () => {
  const response = await fetch('/api/queue?display=true&status=waiting,in-progress', {
    headers: {
      'Authorization': `Bearer ${displayToken}`  // Read-only token
    }
  });
  
  return await response.json();
};
```

### Display UI Component

```tsx
// components/QueueDisplay.tsx
import { useEffect, useState } from 'react';

export default function QueueDisplay() {
  const [queue, setQueue] = useState([]);
  const [currentPatient, setCurrentPatient] = useState(null);
  
  useEffect(() => {
    // Initial load
    fetchQueue();
    
    // WebSocket for real-time updates
    const ws = new WebSocket('wss://clinic.com/ws/queue');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'QUEUE_UPDATE') {
        setQueue(data.queue);
      }
      
      if (data.type === 'PATIENT_CALLED') {
        setCurrentPatient(data.patient);
        // Play announcement sound
        playAnnouncement(data.patient.queueNumber, data.patient.room);
      }
    };
    
    return () => ws.close();
  }, []);
  
  return (
    <div className="queue-display">
      {/* Current Patient */}
      <div className="now-serving">
        <h1>Now Serving</h1>
        <div className="queue-number">{currentPatient?.queueNumber}</div>
        <div className="room">Room: {currentPatient?.room}</div>
      </div>
      
      {/* Waiting Queue */}
      <div className="waiting-list">
        <h2>Waiting</h2>
        <div className="queue-items">
          {queue.filter(q => q.status === 'waiting').map(item => (
            <div key={item._id} className="queue-item">
              <span className="number">{item.queueNumber}</span>
              <span className="wait-time">~{item.estimatedWaitTime} min</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Queue Statistics

```typescript
const getQueueStatistics = async () => {
  const queue = await getActiveQueue({ status: 'waiting,in-progress,completed' });
  
  const stats = {
    waiting: queue.data.filter(q => q.status === 'waiting').length,
    inProgress: queue.data.filter(q => q.status === 'in-progress').length,
    completed: queue.data.filter(q => q.status === 'completed').length,
    averageWaitTime: calculateAverageWaitTime(queue.data),
    averageConsultationTime: calculateAverageConsultationTime(queue.data)
  };
  
  return stats;
};
```

---

## Real-Time Updates

### WebSocket Integration

**Server-Side** (`lib/websocket.ts`):

```typescript
import { Server } from 'socket.io';

export const broadcastQueueUpdate = (tenantId: string, queue: any[]) => {
  io.to(`tenant:${tenantId}:queue`).emit('QUEUE_UPDATE', {
    type: 'QUEUE_UPDATE',
    queue: queue
  });
};

export const broadcastPatientCalled = (tenantId: string, queueEntry: any) => {
  io.to(`tenant:${tenantId}:queue`).emit('PATIENT_CALLED', {
    type: 'PATIENT_CALLED',
    patient: {
      queueNumber: queueEntry.queueNumber,
      patientName: queueEntry.patientName,
      room: queueEntry.room?.name
    }
  });
};
```

**Client-Side**:

```typescript
// hooks/useQueueUpdates.ts
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export const useQueueUpdates = (tenantId: string) => {
  const [queue, setQueue] = useState([]);
  
  useEffect(() => {
    const socket = io('wss://clinic.com', {
      auth: { token: localStorage.getItem('token') }
    });
    
    // Join tenant queue room
    socket.emit('JOIN_ROOM', `tenant:${tenantId}:queue`);
    
    // Listen for updates
    socket.on('QUEUE_UPDATE', (data) => {
      setQueue(data.queue);
    });
    
    socket.on('PATIENT_CALLED', (data) => {
      // Show notification
      showNotification(`${data.patient.queueNumber} - ${data.patient.room}`);
    });
    
    return () => {
      socket.disconnect();
    };
  }, [tenantId]);
  
  return queue;
};
```

### Polling Alternative

For systems without WebSocket:

```typescript
const useQueuePolling = (interval = 5000) => {
  const [queue, setQueue] = useState([]);
  
  useEffect(() => {
    const fetchQueue = async () => {
      const data = await getActiveQueue({ status: 'waiting,in-progress' });
      setQueue(data.data);
    };
    
    fetchQueue(); // Initial load
    
    const intervalId = setInterval(fetchQueue, interval);
    
    return () => clearInterval(intervalId);
  }, [interval]);
  
  return queue;
};
```

---

## QR Code Check-In

### Generate QR Code

**When appointment is created**:

```typescript
const generateQRCode = async (appointmentId: string) => {
  const qrData = {
    type: 'appointment',
    appointmentId: appointmentId,
    timestamp: Date.now()
  };
  
  // Generate QR code (using qrcode library)
  const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));
  
  // Store QR code with appointment
  await Appointment.findByIdAndUpdate(appointmentId, {
    qrCode: qrCode
  });
  
  // Send QR code to patient via email
  await sendEmail({
    to: patient.email,
    subject: 'Appointment QR Code',
    body: `Please scan this QR code when you check in:\n\n${qrCode}`
  });
  
  return qrCode;
};
```

### Scan QR Code to Check In

**API Endpoint**: `POST /api/queue/check-in`

```typescript
const checkInWithQR = async (qrData: string) => {
  const parsed = JSON.parse(qrData);
  
  const response = await fetch('/api/queue/check-in', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      appointmentId: parsed.appointmentId,
      checkInMethod: 'qr_code'
    })
  });
  
  return await response.json();
};
```

### Self-Service Kiosk

```tsx
// components/CheckInKiosk.tsx
import { useState } from 'react';
import QRScanner from 'react-qr-scanner';

export default function CheckInKiosk() {
  const [scanning, setScanning] = useState(false);
  
  const handleScan = async (data: string) => {
    if (data) {
      setScanning(false);
      
      try {
        const result = await checkInWithQR(data);
        
        if (result.success) {
          // Show success message
          showSuccess(`
            Welcome ${result.data.patientName}!
            Your queue number is ${result.data.queueNumber}
            Estimated wait time: ${result.data.estimatedWaitTime} minutes
          `);
        }
      } catch (error) {
        showError('Check-in failed. Please see reception.');
      }
    }
  };
  
  return (
    <div className="kiosk">
      <h1>Self Check-In</h1>
      <p>Please scan your appointment QR code</p>
      
      {scanning ? (
        <QRScanner
          delay={300}
          onScan={handleScan}
          onError={(err) => console.error(err)}
          style={{ width: '100%' }}
        />
      ) : (
        <button onClick={() => setScanning(true)}>
          Start Scanning
        </button>
      )}
    </div>
  );
}
```

---

## API Reference

### Endpoints

| Endpoint | Method | Description | Access |
|----------|--------|-------------|--------|
| `/api/queue` | GET | Get active queue | All staff |
| `/api/queue` | POST | Check in patient | Receptionist, Nurse |
| `/api/queue/:id` | GET | Get queue entry details | All staff |
| `/api/queue/:id` | PATCH | Update queue entry | Receptionist, Doctor, Nurse |
| `/api/queue/:id` | DELETE | Cancel queue entry | Receptionist, Doctor |
| `/api/queue/check-in` | POST | QR code check-in | Kiosk (public) |
| `/api/queue/display` | GET | Queue display data | Display screens |
| `/api/queue/optimize` | POST | Optimize queue order | Admin |

### Query Parameters

**GET /api/queue**:
- `status`: Filter by status (comma-separated: `waiting,in-progress`)
- `doctorId`: Filter by doctor
- `roomId`: Filter by room
- `display`: TV display mode (`true`/`false`)

---

## UI Components

### QueuePageClient

**File**: `components/QueuePageClient.tsx`

Features:
- Real-time queue list
- Check-in form
- Call next patient button
- Queue statistics
- Filter by doctor/status
- Vitals entry

### QueueDisplay

**File**: `components/QueueDisplay.tsx`

Features:
- Full-screen TV display
- Current patient display
- Waiting list
- Auto-refresh
- Sound announcements

---

## Best Practices

### 1. Priority Management

✅ **Do**:
- Use priority 0 for emergencies
- Honor priority order strictly
- Document priority reasons
- Review and adjust priorities

❌ **Don't**:
- Override priority without reason
- Let low-priority patients wait too long
- Forget to update priorities

### 2. Wait Time Estimation

```typescript
// Good: Dynamic calculation
const estimateWaitTime = (queue: IQueue[], position: number) => {
  const avgConsultationTime = 15; // minutes
  const bufferTime = 5;           // minutes
  
  return (position - 1) * (avgConsultationTime + bufferTime);
};

// Good: Factor in doctor schedule
const estimateWithSchedule = (doctor: IDoctor, queueLength: number) => {
  const now = new Date();
  const schedule = getDoctorSchedule(doctor, now);
  
  if (!schedule || !schedule.isAvailable) {
    return null; // Doctor not available
  }
  
  // Calculate based on schedule and queue
  return queueLength * schedule.avgConsultationTime;
};
```

### 3. Real-Time Updates

✅ **Do**:
- Use WebSockets for instant updates
- Broadcast all queue changes
- Handle connection drops gracefully
- Implement reconnection logic

❌ **Don't**:
- Rely solely on polling
- Update every change (batch updates)
- Forget error handling

### 4. Vitals Capture

✅ **Do**:
- Record vitals at check-in
- Validate vital sign values
- Flag abnormal vitals immediately
- Transfer vitals to visit record

❌ **Don't**:
- Skip vitals for routine checkups
- Enter invalid values
- Ignore abnormal readings

### 5. Queue Optimization

```typescript
const optimizeQueue = async (queueEntries: IQueue[]) => {
  // Sort by: 1) Priority, 2) Appointment time, 3) Waiting time
  const optimized = queueEntries.sort((a, b) => {
    // Priority first
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    
    // Then appointment patients before walk-ins
    if (a.queueType === 'appointment' && b.queueType === 'walk-in') {
      return -1;
    }
    if (a.queueType === 'walk-in' && b.queueType === 'appointment') {
      return 1;
    }
    
    // Finally by time queued
    return a.queuedAt.getTime() - b.queuedAt.getTime();
  });
  
  return optimized;
};
```

---

## Common Workflows

### 1. Appointment Patient Check-In

```typescript
// Patient arrives with appointment
// Receptionist scans QR code or selects appointment

// 1. Check in
const queue = await checkInPatient({
  patientId: appointment.patient,
  appointmentId: appointment._id,
  queueType: 'appointment',
  doctorId: appointment.doctor,
  priority: 1
});

// 2. Record vitals
await updateQueue(queue._id, {
  vitals: {
    bp: '120/80',
    hr: 75,
    tempC: 36.8,
    weightKg: 65
  }
});

// 3. Patient waits, sees queue number on TV
```

### 2. Walk-In Patient

```typescript
// Patient arrives without appointment

// 1. Receptionist registers or selects existing patient
const patient = await findOrCreatePatient(patientData);

// 2. Check in as walk-in
const queue = await checkInWalkIn(patient._id);

// 3. Assign to available doctor
await updateQueue(queue._id, {
  doctorId: await findAvailableDoctor()
});
```

### 3. Doctor Calls Next Patient

```typescript
// Doctor completes consultation, calls next

// 1. Complete current patient
await completeConsultation(currentQueue._id, 'billing');

// 2. Get next patient
const nextPatient = await getNextInQueue(doctorId);

// 3. Call patient
await callNextPatient(nextPatient._id);

// 4. Broadcast to TV display (automatic)
// 5. SMS sent to patient (automatic)
```

---

**Last Updated**: February 14, 2026  
**Version**: 1.0.0
