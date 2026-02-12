# Queue Management System - Workflow Documentation

## 📋 Overview

The Queue Management System provides real-time tracking and management of patient flow through the clinic. It handles appointments, walk-ins, and follow-ups in a unified queue with priority management, automatic wait time calculation, and multiple check-in methods.

---

## 🎯 Core Concepts

### Queue Entry Types
- **Appointment (A)** - Scheduled patients moved to queue
- **Walk-In (W)** - Unscheduled patients arriving at clinic
- **Follow-Up (F)** - Previous patients returning for follow-up

### Queue Number Format
```
[Type]-YYYYMMDD-NNN

Examples:
- A20260212-001 (First appointment on Feb 12, 2026)
- W20260212-015 (15th walk-in on Feb 12, 2026)
- F20260212-003 (3rd follow-up on Feb 12, 2026)
```

### Priority Levels
- **0** - Normal (default)
- **1** - High Priority
- **2** - Urgent/Emergency

### Queue Status States
1. **waiting** - Patient checked in, waiting to be called
2. **in-progress** - Currently with doctor
3. **completed** - Consultation finished
4. **cancelled** - Removed from queue
5. **no-show** - Patient didn't show/left

---

## 🔄 Complete Workflow

### Phase 1: Queue Entry Creation

#### From Scheduled Appointment
**Steps:**
1. Patient has confirmed appointment
2. Staff clicks "Move to Queue" button
3. System extracts patient/doctor/room info
4. Creates queue entry via API

**API Call:**
```javascript
POST /api/queue
{
  "patientId": "patient-id",
  "appointmentId": "appointment-id",
  "doctorId": "doctor-id",
  "roomId": "room-id", // optional
  "queueType": "appointment",
  "priority": 0
}
```

**System Actions:**
- Generates unique queue number
- Sets status to `waiting`
- Sets `checkedIn: false`
- Calculates initial wait time
- Returns queue data to frontend

**Response:**
```json
{
  "success": true,
  "data": {
    "queueNumber": "A20260212-001",
    "status": "waiting",
    "estimatedWaitTime": 15,
    "priority": 0
  }
}
```

#### From Walk-In Registration
**Steps:**
1. Patient arrives without appointment
2. Staff clicks "Add Walk-In" button
3. Fills in patient info and reason
4. Optionally adds to queue system

**API Call:**
```javascript
POST /api/queue
{
  "patientId": "patient-id",
  "queueType": "walk-in",
  "doctorId": "doctor-id", // optional
  "priority": 0,
  "notes": "Patient complaint/reason"
}
```

#### From Follow-Up Visit
**Steps:**
1. Patient returns for follow-up
2. Staff verifies previous visit
3. Creates follow-up queue entry

**API Call:**
```javascript
POST /api/queue
{
  "patientId": "patient-id",
  "queueType": "follow-up",
  "doctorId": "previous-doctor-id",
  "priority": 0,
  "notes": "Follow-up for [condition]"
}
```

---

### Phase 2: Queue Display & Monitoring

#### Staff View (QueuePageClient.tsx)

**Features:**
- Real-time auto-refresh (30 seconds)
- Search patients by name/phone
- Filter by doctor, type, status
- Sort by priority and wait time
- Action buttons for each entry

**Display Components:**
```
┌─────────────────────────────────────────────┐
│ 🔄 Queue Management        [Refresh] [Add]  │
├─────────────────────────────────────────────┤
│ Search: [________] Doctor: [All] Type: [All]│
├─────────────────────────────────────────────┤
│ A-001 │ John Doe      │ Dr. Smith │ Waiting │
│ 🔴 2  │ 555-0123      │ Room 101  │ 15 min  │
│       │ [Check In] [Start] [Complete]        │
├─────────────────────────────────────────────┤
│ W-002 │ Jane Smith    │ Unassigned│ Waiting │
│ 🟡 1  │ 555-0124      │ -         │ 30 min  │
│       │ [Check In] [Assign Dr] [Priority]    │
└─────────────────────────────────────────────┘
```

**Auto-Refresh Logic:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchQueue();
  }, 30000); // 30 seconds
  
  return () => clearInterval(interval);
}, []);
```

#### Patient Display (Public View)

**API Endpoint:** `GET /api/queue/display`

**Display Format:**
```
┌──────────────────────────────────────┐
│     PATIENT QUEUE DISPLAY            │
├──────────────────────────────────────┤
│ NOW SERVING:                         │
│                                      │
│        A-005                         │
│                                      │
├──────────────────────────────────────┤
│ WAITING:                             │
│ A-006  →  Est. 15 min                │
│ W-001  →  Est. 30 min                │
│ A-007  →  Est. 45 min                │
└──────────────────────────────────────┘
```

---

### Phase 3: Patient Check-In

#### Method 1: Manual Check-In (Staff)

**User Action:**
1. Patient arrives at reception
2. Staff finds patient in queue
3. Clicks "Check In" button
4. System verifies identity

**API Call:**
```javascript
POST /api/queue/check-in
{
  "queueId": "queue-entry-id",
  "method": "manual"
}
```

**System Actions:**
- Updates `checkedIn: true`
- Records check-in time
- Recalculates queue positions
- Updates wait times for all patients
- Sends notification (optional)

#### Method 2: QR Code Check-In

**User Action:**
1. Patient receives QR code (SMS/email)
2. Scans QR at clinic kiosk
3. System auto-checks in

**QR Code Format:**
```
{
  "queueId": "queue-entry-id",
  "patientId": "patient-id",
  "queueNumber": "A20260212-001",
  "validUntil": "2026-02-12T23:59:59Z"
}
```

**API Call:**
```javascript
POST /api/queue/check-in
{
  "qrCode": "encrypted-qr-data",
  "method": "qr-code"
}
```

**Validation:**
- Verify QR code signature
- Check expiration
- Confirm patient/queue match
- Prevent duplicate check-ins

#### Method 3: Self-Service Kiosk

**User Action:**
1. Patient uses touch screen kiosk
2. Enters phone number or ID
3. System finds queue entry
4. Patient confirms identity
5. Auto-checks in

**Flow:**
```
Enter Phone: [5][5][5]-[0][1][2][3]
              ↓
Found: John Doe
Queue: A20260212-001
Est. Wait: 15 minutes
              ↓
[✓ Confirm Check-In]
              ↓
Checked In Successfully!
Please wait in seating area.
```

---

### Phase 4: Queue Management & Optimization

#### Wait Time Calculation

**Formula:**
```
Estimated Wait Time = (Position in Queue - 1) × Average Consultation Time

Default: 15 minutes per patient
Can be configured per doctor/specialization
```

**Example:**
```javascript
Position 1: 0 min (currently with doctor)
Position 2: 15 min
Position 3: 30 min
Position 4: 45 min
Position 5: 60 min
```

#### Priority Queue Algorithm

**Sorting Order:**
1. Priority level (descending: 2 → 1 → 0)
2. Check-in time (ascending: first come, first served)
3. Estimated wait time
4. Appointment vs walk-in (appointments first)

**Example Queue Order:**
```
Priority 2 (Urgent)    - Position 1
Priority 2 (Urgent)    - Position 2
Priority 1 (High)      - Position 3
Priority 1 (High)      - Position 4
Priority 0 (Normal)    - Position 5
Priority 0 (Normal)    - Position 6
```

#### Queue Optimization

**API Endpoint:** `POST /api/queue/optimize`

**Optimization Factors:**
```typescript
{
  doctorAvailability: {
    doctorId: "doc-id",
    available: true,
    currentPatient: null,
    estimatedTimeToFree: 10 // minutes
  },
  roomAvailability: {
    roomId: "room-id",
    available: true,
    occupiedBy: null
  },
  patientWaitTime: {
    queueId: "queue-id",
    waitingMinutes: 45,
    threshold: 60 // alert if exceeds
  },
  priority: {
    queueId: "queue-id",
    level: 2,
    reason: "Emergency"
  }
}
```

**Optimization Actions:**
- Reassign patients to available doctors
- Balance load across multiple doctors
- Alert for long wait times
- Suggest room assignments
- Reorder queue for efficiency

---

### Phase 5: Doctor Consultation

#### Starting Consultation

**User Action:**
1. Doctor ready for next patient
2. Staff clicks "Start" or "In Progress"
3. Patient called to consultation room

**API Call:**
```javascript
PUT /api/queue/[id]
{
  "status": "in-progress",
  "roomId": "room-101"
}
```

**System Actions:**
- Updates queue status
- Records start time
- Starts consultation timer
- Removes from waiting display
- Updates patient count

#### During Consultation

**Available Actions:**
- Order lab tests
- Write prescriptions
- Schedule follow-up
- Add clinical notes
- Request diagnostic imaging

**These actions integrate with:**
- Lab Results system
- ePrescription system
- Appointment scheduling
- Clinical Visit records

#### Consultation Timer

**Tracking:**
```typescript
{
  startTime: "2026-02-12T10:00:00Z",
  endTime: null,
  duration: null, // calculated on completion
  pausedTime: 0, // for interruptions
  status: "in-progress"
}
```

**Display:**
- Real-time timer in UI
- Average time per doctor
- Alerts for extended consultations
- Analytics for clinic performance

---

### Phase 6: Completion & Checkout

#### Completing Queue Entry

**User Action:**
1. Consultation finished
2. Doctor/staff clicks "Complete"
3. System finalizes entry

**API Call:**
```javascript
PUT /api/queue/[id]
{
  "status": "completed",
  "completionNotes": "Follow-up in 2 weeks",
  "nextAction": "billing"
}
```

**System Actions:**
- Stops consultation timer
- Calculates total duration
- Updates status to completed
- Triggers next action flow
- Archives queue entry

#### Next Actions Flow

**1. Billing Required:**
```
Complete → Generate Invoice → Payment → Checkout
```

**2. Pharmacy Required:**
```
Complete → Send ePrescription → Pharmacy Fills → Checkout
```

**3. Lab Tests Required:**
```
Complete → Order Tests → Lab Processing → Results → Follow-up
```

**4. Direct Checkout:**
```
Complete → Update Records → Patient Leaves
```

#### Archive & Audit

**Archive Process:**
```javascript
{
  queueId: "queue-id",
  archivedAt: "2026-02-12T10:30:00Z",
  finalStatus: "completed",
  totalDuration: 25, // minutes
  appointmentId: "apt-id",
  outcome: "success"
}
```

**Audit Trail:**
- All status changes logged
- User actions recorded
- Timestamps for each phase
- Data retention for analytics
- Compliance tracking

---

## 🔍 Search & Filter Features

### Search Capabilities

**Search Fields:**
- Patient name (first name, last name)
- Patient phone number
- Queue number
- Doctor name
- Room number

**Search Logic:**
```typescript
const filteredQueue = queue.filter(item => {
  const patientName = `${item.patient?.firstName} ${item.patient?.lastName}`.toLowerCase();
  const doctorName = item.doctor ? 
    `${item.doctor.firstName} ${item.doctor.lastName}`.toLowerCase() : '';
  const searchLower = searchQuery.toLowerCase();
  
  return patientName.includes(searchLower) ||
         item.patient?.phone?.includes(searchLower) ||
         item.queueNumber.toLowerCase().includes(searchLower) ||
         doctorName.includes(searchLower);
});
```

### Filter Options

**1. Doctor Filter:**
```typescript
filterDoctor: string // doctor ID
// Shows only patients assigned to selected doctor
```

**2. Type Filter:**
```typescript
filterType: 'appointment' | 'walk-in' | 'follow-up' | 'all'
// Shows only selected queue type
```

**3. Status Filter:**
```typescript
filterStatus: 'waiting' | 'in-progress' | 'completed' | 'all'
// Shows only selected status
```

**4. Priority Filter:**
```typescript
filterPriority: 0 | 1 | 2 | null
// Shows only selected priority level
```

### Combined Filters

**Example:**
```typescript
// Show all urgent walk-ins waiting for Dr. Smith
{
  doctor: "dr-smith-id",
  type: "walk-in",
  status: "waiting",
  priority: 2
}
```

---

## 🎨 UI Components & Features

### Queue Card Component

**Display Elements:**
```tsx
<QueueCard>
  <Priority badge="urgent" color="red" icon="⚠️" />
  <QueueNumber>A-001</QueueNumber>
  <PatientInfo>
    <Name link="/patients/123">John Doe</Name>
    <Phone>555-0123</Phone>
  </PatientInfo>
  <DoctorInfo>
    <Name>Dr. Smith</Name>
    <Room>Room 101</Room>
  </DoctorInfo>
  <Status badge="waiting" color="yellow" />
  <WaitTime>15 min</WaitTime>
  <Actions>
    <Button action="checkIn">Check In</Button>
    <Button action="start">Start</Button>
    <Button action="complete">Complete</Button>
    <Button action="priority">Set Priority</Button>
  </Actions>
</QueueCard>
```

### Action Buttons

**Check In Button:**
- Visible when: status = 'waiting' AND checkedIn = false
- Action: Mark patient as checked in
- Color: Orange
- Icon: Check circle

**Start Button:**
- Visible when: status = 'waiting' AND checkedIn = true
- Action: Begin consultation (status → 'in-progress')
- Color: Blue
- Icon: Play

**Complete Button:**
- Visible when: status = 'in-progress'
- Action: Finish consultation (status → 'completed')
- Color: Green
- Icon: Check

**Cancel Button:**
- Visible when: status = 'waiting' OR 'in-progress'
- Action: Remove from queue (status → 'cancelled')
- Color: Red
- Icon: X

**Priority Button:**
- Visible: Always
- Action: Change priority level
- Color: Purple
- Icon: Flag

### Status Badges

**Visual Indicators:**
```tsx
// Waiting - Yellow badge with clock icon
<Badge color="yellow" icon="⏳">Waiting</Badge>

// In Progress - Blue badge with activity icon
<Badge color="blue" icon="🔄">In Progress</Badge>

// Completed - Green badge with check icon
<Badge color="green" icon="✓">Completed</Badge>

// No-Show - Gray badge with x icon
<Badge color="gray" icon="✗">No-Show</Badge>

// Cancelled - Red badge with ban icon
<Badge color="red" icon="🚫">Cancelled</Badge>
```

### Real-Time Updates

**Auto-Refresh Indicator:**
```tsx
<RefreshIndicator>
  <Spinner size="small" />
  <Text>Auto-refresh in {countdown}s</Text>
  <Button onClick={manualRefresh}>Refresh Now</Button>
</RefreshIndicator>
```

**Update Notifications:**
```tsx
// New patient added to queue
<Notification type="info" duration={4000}>
  New patient added to queue: A-008
</Notification>

// Patient checked in
<Notification type="success" duration={4000}>
  John Doe checked in successfully
</Notification>

// Long wait time alert
<Notification type="warning" duration={6000}>
  Patient A-003 waiting over 60 minutes
</Notification>
```

---

## 🔧 Technical Implementation

### Key API Endpoints

**Queue CRUD:**
```
GET    /api/queue              - List all queue entries
POST   /api/queue              - Create new queue entry
GET    /api/queue/[id]         - Get single queue entry
PUT    /api/queue/[id]         - Update queue entry
DELETE /api/queue/[id]         - Remove from queue
```

**Queue Actions:**
```
POST   /api/queue/check-in     - Check in patient
POST   /api/queue/optimize     - Optimize queue order
GET    /api/queue/optimize     - Get optimization suggestions
GET    /api/queue/display      - Public display data
POST   /api/queue/qr-generate  - Generate check-in QR code
```

### Data Models

**Queue Schema:**
```typescript
interface Queue {
  _id: string;
  tenantId: string;
  queueNumber: string;           // A/W/F-YYYYMMDD-NNN
  queueType: 'appointment' | 'walk-in' | 'follow-up';
  patient: Patient | string;     // Reference or populated
  doctor?: Doctor | string;      // Optional, can be assigned later
  room?: Room | string;          // Optional
  appointment?: Appointment | string;
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  priority: 0 | 1 | 2;
  checkedIn: boolean;
  checkedInAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedWaitTime: number;     // Minutes
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Frontend State Management

**QueuePageClient State:**
```typescript
const [queue, setQueue] = useState<Queue[]>([]);
const [loading, setLoading] = useState(true);
const [searchQuery, setSearchQuery] = useState('');
const [filterDoctor, setFilterDoctor] = useState('');
const [filterType, setFilterType] = useState('all');
const [filterStatus, setFilterStatus] = useState('waiting');
const [refreshing, setRefreshing] = useState(false);
const [countdown, setCountdown] = useState(30);
```

**Key Functions:**
```typescript
// Fetch queue data
const fetchQueue = async () => {
  const res = await fetch('/api/queue?status=waiting,in-progress');
  const data = await res.json();
  if (data.success) setQueue(data.data);
};

// Check in patient
const handleCheckIn = async (queueId: string) => {
  await fetch('/api/queue/check-in', {
    method: 'POST',
    body: JSON.stringify({ queueId })
  });
  fetchQueue(); // Refresh
};

// Update status
const handleStatusUpdate = async (queueId: string, status: string) => {
  await fetch(`/api/queue/${queueId}`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  });
  fetchQueue(); // Refresh
};
```

---

## 📊 Analytics & Reporting

### Queue Metrics

**Key Performance Indicators:**
```typescript
interface QueueMetrics {
  averageWaitTime: number;        // Average wait across all patients
  averageConsultationTime: number;// Average time with doctor
  totalPatientsToday: number;
  currentQueueLength: number;
  completedToday: number;
  noShowRate: number;             // Percentage
  peakHours: string[];            // Busiest time ranges
  doctorUtilization: {
    doctorId: string;
    patientsServed: number;
    averageTime: number;
    utilizationRate: number;      // Percentage
  }[];
}
```

### Reports

**Daily Queue Report:**
- Total patients processed
- Average wait times by hour
- No-show statistics
- Doctor performance
- Peak times identification

**Weekly Trends:**
- Daily comparison
- Busiest days
- Appointment vs walk-in ratio
- Priority distribution

**Monthly Analytics:**
- Volume trends
- Efficiency improvements
- Patient satisfaction correlation
- Resource allocation insights

---

## ⚠️ Error Handling & Edge Cases

### Common Errors

**1. Patient Already in Queue:**
```typescript
if (existingQueue) {
  return {
    success: false,
    error: 'Patient already has an active queue entry',
    existingQueueId: existingQueue._id
  };
}
```

**2. Invalid Queue Status Transition:**
```typescript
// Can't go from 'completed' back to 'waiting'
if (currentStatus === 'completed' && newStatus === 'waiting') {
  return {
    success: false,
    error: 'Cannot reopen completed queue entry'
  };
}
```

**3. Missing Patient/Doctor Reference:**
```typescript
if (!patient) {
  return {
    success: false,
    error: 'Patient not found or not accessible in this tenant'
  };
}
```

### Edge Cases

**Scenario 1: Patient Leaves Before Being Seen**
- Action: Update status to 'no-show'
- Update appointment if linked
- Calculate refund/rescheduling policy

**Scenario 2: Emergency Patient Arrives**
- Action: Set priority to 2 (urgent)
- Run queue optimization
- Move to front of queue
- Notify staff

**Scenario 3: Doctor Unavailable Mid-Day**
- Action: Reassign patients to available doctors
- Update wait times
- Notify affected patients
- Offer rescheduling options

**Scenario 4: System Downtime**
- Action: Fall back to manual queue management
- Use printed queue numbers
- Update system when back online
- Sync changes from manual records

---

## 🔐 Security & Permissions

### Role-Based Access

**Queue Permissions:**
```typescript
permissions: {
  'queue:read': ['doctor', 'nurse', 'receptionist', 'admin'],
  'queue:write': ['doctor', 'nurse', 'receptionist', 'admin'],
  'queue:update': ['doctor', 'nurse', 'admin'],
  'queue:delete': ['admin'],
  'queue:check-in': ['receptionist', 'nurse', 'admin'],
  'queue:optimize': ['admin', 'doctor']
}
```

### Tenant Isolation

**All queries must filter by tenant:**
```typescript
const queue = await Queue.find({
  tenantId: currentTenant,
  status: { $in: ['waiting', 'in-progress'] }
});
```

**Prevent cross-tenant access:**
```typescript
if (queueEntry.tenantId !== currentUser.tenantId) {
  throw new Error('Unauthorized access to queue entry');
}
```

---

## 🚀 Future Enhancements

### Planned Features

- [ ] **SMS Notifications:** Auto-notify patients when their turn is near
- [ ] **Mobile App Integration:** Patients check queue position from phone
- [ ] **AI-Powered Predictions:** Predict wait times based on historical data
- [ ] **Video Queue:** Virtual consultations with queue management
- [ ] **Multi-Location Support:** Manage queues across multiple clinic branches
- [ ] **Patient Feedback:** Quick satisfaction survey after consultation
- [ ] **Dynamic Pricing:** Adjust fees based on wait time/priority
- [ ] **Staff Performance Dashboard:** Real-time metrics for managers

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue: Auto-refresh not working**
- Check browser console for errors
- Verify internet connection
- Clear cache and reload
- Check if API endpoint is responding

**Issue: Patient not appearing in queue**
- Verify patient belongs to correct tenant
- Check if queue entry was created successfully
- Review API logs for errors
- Confirm search filters aren't hiding entry

**Issue: Incorrect wait times**
- Verify consultation time settings
- Check if positions are calculated correctly
- Review optimization algorithm
- Ensure timer is running properly

### Debug Mode

**Enable debugging:**
```typescript
localStorage.setItem('DEBUG_QUEUE', 'true');
```

**Debug output:**
- API request/response logs
- State change tracking
- Filter application details
- Real-time sync status

---

**Last Updated:** February 12, 2026  
**Version:** 1.0  
**Maintainer:** MyClinicSoft Development Team
