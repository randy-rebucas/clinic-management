# Status Journeys Documentation

This document describes the complete journey and status transitions for Appointments, Queue, Medications, and Prescriptions in MyClinicSoft.

---

## 1. Appointment Status Journey

### Overview
Appointments represent scheduled patient visits with a doctor/provider. They flow through various statuses from creation to completion.

### Status Definitions

| Status | Description | When Set |
|--------|-------------|----------|
| `pending` | Appointment created but not yet scheduled | Initial creation |
| `scheduled` | Appointment scheduled with date/time | When date/time assigned |
| `confirmed` | Patient confirmed the appointment | Patient confirmation |
| `rescheduled` | Appointment date/time changed | When rescheduled |
| `no-show` | Patient didn't show up | After appointment time passes |
| `completed` | Appointment finished successfully | After consultation |
| `cancelled` | Appointment cancelled | When cancelled |

### Status Flow Diagram

```
                    ┌─────────┐
                    │ pending │
                    └────┬────┘
                         │
                         ▼
                  ┌──────────┐
                  │scheduled  │
                  └────┬─────┘
                       │
                       ├───► confirmed ────► completed
                       │
                       ├───► rescheduled ───► scheduled (new date)
                       │
                       ├───► cancelled
                       │
                       └───► no-show
```

### Detailed Journey

#### 1.1 Appointment Creation
**Entry Points:**
- Staff creates appointment: `POST /api/appointments`
- Patient self-books: `POST /api/appointments/public`
- Patient portal: `POST /api/patients/appointments`
- Walk-in: `POST /api/appointments` with `isWalkIn: true`

**Initial State:**
```javascript
{
  status: 'pending' | 'scheduled',  // Default: 'scheduled'
  appointmentCode: 'APT-000001',    // Auto-generated
  appointmentDate: Date,
  appointmentTime: '10:00',
  // OR
  scheduledAt: Date,                // Alternative format
  patient: ObjectId,
  doctor: ObjectId | provider: ObjectId,
  isWalkIn: false
}
```

**Actions:**
- System auto-generates `appointmentCode`
- Validates doctor availability
- Checks for conflicts
- Sets initial status

**Automations Triggered:**
- ✅ Welcome message (if new patient)
- ✅ Appointment confirmation request (if enabled)

---

#### 1.2 Status: `scheduled`
**Description:** Appointment has date/time assigned

**Transitions From:**
- `pending` → `scheduled` (when date/time added)
- `rescheduled` → `scheduled` (after rescheduling)

**Transitions To:**
- `confirmed` (patient confirms)
- `rescheduled` (date/time changed)
- `cancelled` (appointment cancelled)
- `no-show` (patient doesn't show)

**Key Actions:**
- Send appointment reminders (24h, 2h before)
- Allow patient confirmation
- Check-in available when patient arrives

**API Endpoints:**
- `PUT /api/appointments/{id}` - Update status
- `GET /api/appointments/{id}/confirm` - Patient confirmation

**Automations Triggered:**
- ✅ Appointment reminders (24h, 2h before)
- ✅ Appointment confirmation automation

---

#### 1.3 Status: `confirmed`
**Description:** Patient confirmed the appointment

**Transitions From:**
- `scheduled` → `confirmed` (patient confirms)

**Transitions To:**
- `completed` (after consultation)
- `cancelled` (if cancelled)
- `no-show` (if patient doesn't show)

**Key Actions:**
- Patient has confirmed attendance
- Higher priority in queue
- Send final reminder (2h before)

**API Endpoints:**
- `GET /api/appointments/{id}/confirm?status=confirmed`
- `PUT /api/appointments/{id}` - Update status

**Automations Triggered:**
- ✅ Final appointment reminder (2h before)

---

#### 1.4 Status: `rescheduled`
**Description:** Appointment date/time changed

**Transitions From:**
- `scheduled` → `rescheduled` (when date/time changed)
- `confirmed` → `rescheduled` (when date/time changed)

**Transitions To:**
- `scheduled` (with new date/time)

**Key Actions:**
- Update appointment date/time
- Notify patient of change
- Cancel old slot, create new slot

**API Endpoints:**
- `PUT /api/appointments/{id}` - Update date/time

**Automations Triggered:**
- ✅ Rescheduling notification

---

#### 1.5 Status: `no-show`
**Description:** Patient didn't show up for appointment

**Transitions From:**
- `scheduled` → `no-show` (after appointment time passes)
- `confirmed` → `no-show` (after appointment time passes)

**Transitions To:**
- None (terminal state)

**Key Actions:**
- Mark as no-show automatically (cron job)
- Send apology and rescheduling offer
- Update doctor schedule

**API Endpoints:**
- Automatic via cron: `GET /api/cron/no-show-handling`

**Automations Triggered:**
- ✅ No-show handling automation
- ✅ Rescheduling offer

---

#### 1.6 Status: `cancelled`
**Description:** Appointment cancelled

**Transitions From:**
- Any status → `cancelled` (when cancelled)

**Transitions To:**
- None (terminal state)

**Key Actions:**
- Mark appointment as cancelled
- Free up time slot
- Notify patient
- Fill from waitlist if available

**API Endpoints:**
- `PUT /api/appointments/{id}` - Set status to 'cancelled'
- `DELETE /api/appointments/{id}` - Delete appointment

**Automations Triggered:**
- ✅ Waitlist management (fill cancelled slot)

---

#### 1.7 Status: `completed`
**Description:** Appointment finished successfully

**Transitions From:**
- `confirmed` → `completed` (after consultation)
- `scheduled` → `completed` (if walk-in completed)

**Transitions To:**
- None (terminal state)

**Key Actions:**
- Mark appointment as completed
- Create Visit record
- Update patient history
- Generate invoice (if enabled)

**API Endpoints:**
- `PUT /api/appointments/{id}` - Set status to 'completed'

**Automations Triggered:**
- ✅ Invoice generation (if visit closed)
- ✅ Visit summary (if visit closed)

---

## 2. Queue Status Journey

### Overview
Queue manages patient flow from check-in to consultation completion. It links appointments, visits, and patient flow.

### Status Definitions

| Status | Description | When Set |
|--------|-------------|----------|
| `waiting` | Patient in queue, waiting | Initial check-in |
| `in-progress` | Patient with doctor | Consultation started |
| `completed` | Consultation finished | Visit completed |
| `cancelled` | Queue entry cancelled | When cancelled |
| `no-show` | Patient didn't show | After being called |

### Status Flow Diagram

```
                    ┌─────────┐
                    │ waiting │
                    └────┬────┘
                         │
                         ▼
                ┌──────────────┐
                │ in-progress  │
                └──────┬───────┘
                       │
                       ├───► completed
                       │
                       ├───► cancelled
                       │
                       └───► no-show
```

### Detailed Journey

#### 2.1 Queue Creation
**Entry Points:**
- Patient check-in: `POST /api/queue`
- Appointment check-in: `POST /api/queue/[id]/check-in`
- Walk-in registration: `POST /api/queue` with `queueType: 'walk-in'`

**Initial State:**
```javascript
{
  status: 'waiting',
  queueNumber: 'A20240101-001',  // Auto-generated
  queueType: 'appointment' | 'walk-in' | 'follow-up',
  patient: ObjectId,
  appointment: ObjectId,          // If from appointment
  doctor: ObjectId,
  room: ObjectId,
  checkedIn: false,
  priority: 0,                    // Lower = higher priority
  queuedAt: Date
}
```

**Actions:**
- Auto-generate queue number
- Calculate estimated wait time
- Assign priority
- Link to appointment (if applicable)

**Check-in Methods:**
- Manual (receptionist)
- QR Code scan
- Kiosk self-service

**API Endpoints:**
- `POST /api/queue` - Create queue entry
- `POST /api/queue/[id]/check-in` - Check-in patient

---

#### 2.2 Status: `waiting`
**Description:** Patient in queue, waiting for consultation

**Transitions From:**
- Initial creation → `waiting`

**Transitions To:**
- `in-progress` (when called to see doctor)
- `cancelled` (if cancelled)
- `no-show` (if patient doesn't respond when called)

**Key Actions:**
- Display in queue
- Calculate position
- Update estimated wait time
- Show on queue display board

**Queue Display:**
- Position in queue
- Estimated wait time
- Assigned doctor/room
- Priority indicator

**API Endpoints:**
- `GET /api/queue` - Get current queue
- `PUT /api/queue/[id]` - Update queue status

---

#### 2.3 Status: `in-progress`
**Description:** Patient with doctor, consultation in progress

**Transitions From:**
- `waiting` → `in-progress` (when called/started)

**Transitions To:**
- `completed` (consultation finished)
- `cancelled` (if cancelled mid-consultation)

**Key Actions:**
- Mark consultation as started
- Record `startedAt` timestamp
- Update appointment status (if linked)
- Create/update Visit record

**API Endpoints:**
- `PUT /api/queue/[id]` - Set status to 'in-progress'
- `POST /api/visits` - Create visit from queue

**Related Actions:**
- Create Visit record
- Record vitals
- Start consultation notes

---

#### 2.4 Status: `completed`
**Description:** Consultation finished

**Transitions From:**
- `in-progress` → `completed` (when consultation ends)

**Transitions To:**
- None (terminal state)

**Key Actions:**
- Mark queue as completed
- Record `completedAt` timestamp
- Close Visit record (if created)
- Update appointment status to 'completed'
- Generate invoice (if enabled)

**API Endpoints:**
- `PUT /api/queue/[id]` - Set status to 'completed'
- `PUT /api/visits/[id]` - Close visit

**Automations Triggered:**
- ✅ Invoice generation (if visit closed)
- ✅ Visit summary (if visit closed)
- ✅ Follow-up scheduling (if follow-up date set)

---

#### 2.5 Status: `cancelled`
**Description:** Queue entry cancelled

**Transitions From:**
- Any status → `cancelled` (when cancelled)

**Transitions To:**
- None (terminal state)

**Key Actions:**
- Mark queue as cancelled
- Free up doctor/room
- Update appointment status (if linked)
- Notify relevant staff

**API Endpoints:**
- `PUT /api/queue/[id]` - Set status to 'cancelled'

---

#### 2.6 Status: `no-show`
**Description:** Patient didn't show when called

**Transitions From:**
- `waiting` → `no-show` (when called but no response)

**Transitions To:**
- None (terminal state)

**Key Actions:**
- Mark as no-show
- Update appointment status to 'no-show' (if linked)
- Free up doctor/room
- Send no-show notification

**API Endpoints:**
- `PUT /api/queue/[id]` - Set status to 'no-show'

**Automations Triggered:**
- ✅ No-show handling automation

---

## 3. Medication Journey

### Overview
Medications are the master catalog of medicines available in the system. They are referenced by prescriptions.

### Medicine Model Structure

```javascript
{
  name: string,                    // Brand name
  genericName?: string,            // Generic name
  brandNames?: string[],          // Alternative brand names
  form: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops' | 'inhaler' | 'other',
  strength: string,                // e.g., "500 mg"
  unit: string,                    // e.g., "mg", "ml"
  route: 'oral' | 'iv' | 'im' | 'topical' | 'inhalation' | 'ophthalmic' | 'otic' | 'other',
  category: string,                // e.g., "Antibiotic", "Analgesic"
  indications: string[],           // What it's used for
  contraindications?: string[],    // When not to use
  sideEffects?: string[],          // Common side effects
  dosageRanges?: IDosageRange[],   // Age/weight-based dosage
  standardDosage?: string,         // Standard adult dosage
  standardFrequency?: string,      // Standard frequency
  duration?: string,               // Typical duration
  requiresPrescription: boolean,
  controlledSubstance?: boolean,
  schedule?: string,               // e.g., "Schedule II"
  active: boolean                  // Whether available
}
```

### Medicine Lifecycle

```
┌─────────────┐
│  Medicine   │
│  Created    │
└──────┬──────┘
       │
       ├───► Active (available for prescription)
       │
       ├───► Inactive (temporarily unavailable)
       │
       └───► Archived (no longer used)
```

### Medicine States

| State | Description | Usage |
|-------|-------------|-------|
| `active: true` | Available for prescription | Can be prescribed |
| `active: false` | Temporarily unavailable | Cannot be prescribed |
| Archived | No longer in use | Historical reference only |

### Medicine Management

**Creation:**
- Admin creates medicine: `POST /api/medicines`
- Import from database
- Bulk import

**Updates:**
- Update details: `PUT /api/medicines/{id}`
- Deactivate: Set `active: false`
- Reactivate: Set `active: true`

**Usage:**
- Referenced in prescriptions via `medicineId`
- Used for drug interaction checks
- Used for dosage calculations

**API Endpoints:**
- `GET /api/medicines` - List medicines
- `POST /api/medicines` - Create medicine
- `PUT /api/medicines/{id}` - Update medicine
- `DELETE /api/medicines/{id}` - Delete medicine

---

## 4. Prescription Status Journey

### Overview
Prescriptions are created during visits and prescribe medications to patients. They flow through various statuses from creation to completion.

### Status Definitions

| Status | Description | When Set |
|--------|-------------|----------|
| `active` | Prescription issued, patient can fill | Initial creation |
| `completed` | Prescription fully used/expired | After duration ends |
| `cancelled` | Prescription cancelled | When cancelled |
| `dispensed` | Fully dispensed at pharmacy | When all dispensed |
| `partially-dispensed` | Partially dispensed | When partially filled |

### Status Flow Diagram

```
                    ┌─────────┐
                    │ active  │
                    └────┬────┘
                         │
                         ├───► dispensed ────► completed
                         │
                         ├───► partially-dispensed ────► dispensed ────► completed
                         │
                         ├───► completed (duration expired)
                         │
                         └───► cancelled
```

### Detailed Journey

#### 4.1 Prescription Creation
**Entry Points:**
- During visit: `POST /api/prescriptions`
- From visit form: Doctor creates prescription

**Initial State:**
```javascript
{
  status: 'active',
  prescriptionCode: 'RX-000001',    // Auto-generated
  visit: ObjectId,                  // Linked visit
  patient: ObjectId,
  prescribedBy: ObjectId,           // Doctor/provider
  issuedAt: Date,
  medications: [
    {
      medicineId: ObjectId,         // Reference to Medicine
      name: string,
      dose: string,
      frequency: string,            // "BID", "TID", etc.
      durationDays: number,
      quantity: number,
      instructions: string
    }
  ],
  digitalSignature: {
    providerName: string,
    signatureData: string,
    signedAt: Date
  }
}
```

**Actions:**
- Auto-generate prescription code
- Link to visit and patient
- Check drug interactions
- Calculate dosages
- Digital signature (if enabled)

**API Endpoints:**
- `POST /api/prescriptions` - Create prescription

**Automations Triggered:**
- ✅ Drug interaction check
- ✅ Prescription notification to patient

---

#### 4.2 Status: `active`
**Description:** Prescription issued, patient can fill

**Transitions From:**
- Initial creation → `active`

**Transitions To:**
- `dispensed` (when fully dispensed)
- `partially-dispensed` (when partially dispensed)
- `completed` (when duration expires)
- `cancelled` (when cancelled)

**Key Actions:**
- Patient can fill at pharmacy
- Track refill dates
- Send medication reminders
- Monitor adherence

**Medication Reminders:**
- Based on frequency (BID, TID, QID)
- Sent at scheduled times
- Multiple reminders per day if needed

**API Endpoints:**
- `GET /api/prescriptions` - List active prescriptions
- `PUT /api/prescriptions/{id}` - Update prescription

**Automations Triggered:**
- ✅ Medication adherence reminders (4x daily)
- ✅ Prescription refill reminders (3 days, 1 day, on date)

---

#### 4.3 Status: `partially-dispensed`
**Description:** Some medications dispensed, but not all

**Transitions From:**
- `active` → `partially-dispensed` (when partially filled)

**Transitions To:**
- `dispensed` (when fully dispensed)
- `completed` (when duration expires)

**Key Actions:**
- Track partial dispensations
- Record pharmacy information
- Update remaining quantity

**Pharmacy Dispense Record:**
```javascript
{
  pharmacyId: string,
  pharmacyName: string,
  dispensedAt: Date,
  quantityDispensed: number,
  trackingNumber: string
}
```

**API Endpoints:**
- `PUT /api/prescriptions/{id}` - Update dispense status

---

#### 4.4 Status: `dispensed`
**Description:** All medications fully dispensed

**Transitions From:**
- `active` → `dispensed` (when fully dispensed)
- `partially-dispensed` → `dispensed` (when remaining dispensed)

**Transitions To:**
- `completed` (when duration expires)

**Key Actions:**
- Mark as fully dispensed
- Record all pharmacy dispensations
- Continue medication reminders until completion

**API Endpoints:**
- `PUT /api/prescriptions/{id}` - Update to 'dispensed'

---

#### 4.5 Status: `completed`
**Description:** Prescription fully used or expired

**Transitions From:**
- `active` → `completed` (when duration expires)
- `dispensed` → `completed` (when duration expires)
- `partially-dispensed` → `completed` (when duration expires)

**Transitions To:**
- None (terminal state)

**Key Actions:**
- Mark prescription as completed
- Stop medication reminders
- Archive prescription
- Update patient medication history

**Completion Triggers:**
- Duration expired (`issuedAt + durationDays`)
- All medications used
- Manual completion by doctor

**API Endpoints:**
- `PUT /api/prescriptions/{id}` - Set status to 'completed'
- Automatic via cron (check expired prescriptions)

**Automations Triggered:**
- ✅ Prescription completion notification

---

#### 4.6 Status: `cancelled`
**Description:** Prescription cancelled

**Transitions From:**
- Any status → `cancelled` (when cancelled)

**Transitions To:**
- None (terminal state)

**Key Actions:**
- Mark prescription as cancelled
- Stop medication reminders
- Record cancellation reason
- Notify patient (if needed)

**Cancellation Reasons:**
- Patient request
- Drug interaction discovered
- Allergy discovered
- Doctor decision

**API Endpoints:**
- `PUT /api/prescriptions/{id}` - Set status to 'cancelled'

---

## 5. Complete Flow: Appointment → Queue → Visit → Prescription

### End-to-End Journey

```
1. Appointment Created
   └─► status: 'scheduled'
       └─► Patient confirms
           └─► status: 'confirmed'

2. Patient Arrives & Checks In
   └─► Queue Entry Created
       └─► status: 'waiting'
           └─► checkedIn: true

3. Patient Called to Consultation
   └─► Queue status: 'in-progress'
       └─► Visit Created
           └─► status: 'open'

4. Doctor Prescribes Medications
   └─► Prescription Created
       └─► status: 'active'
           └─► Medications linked to Medicine catalog

5. Consultation Ends
   └─► Visit status: 'closed'
       └─► Queue status: 'completed'
           └─► Appointment status: 'completed'
               └─► Invoice Generated (automated)

6. Patient Fills Prescription
   └─► Prescription status: 'dispensed'
       └─► Medication reminders sent (automated)

7. Prescription Duration Expires
   └─► Prescription status: 'completed'
       └─► Reminders stop
```

---

## 6. Key Relationships

### Appointment ↔ Queue
- **One-to-One:** One appointment can have one queue entry
- **Queue Type:** `'appointment'` when linked to appointment
- **Status Sync:** Queue status can update appointment status

### Queue ↔ Visit
- **One-to-One:** One queue entry can create one visit
- **Visit Creation:** Visit created when queue status becomes 'in-progress'
- **Status Sync:** Visit closure updates queue to 'completed'

### Visit ↔ Prescription
- **One-to-Many:** One visit can have multiple prescriptions
- **Prescription Link:** Prescription links to visit via `visit` field
- **Creation:** Prescriptions created during visit

### Prescription ↔ Medication
- **Many-to-Many:** Prescription contains multiple medications
- **Medicine Reference:** Each medication references Medicine via `medicineId`
- **Medication Array:** Prescription has `medications[]` array

---

## 7. Automation Integration Points

### Appointment Automations
- ✅ Appointment confirmation (status: `scheduled` → `confirmed`)
- ✅ Appointment reminders (status: `scheduled` or `confirmed`)
- ✅ No-show handling (status: `scheduled`/`confirmed` → `no-show`)
- ✅ Waitlist management (status: `cancelled`)

### Queue Automations
- ✅ Queue optimization
- ✅ Wait time calculation
- ✅ Priority management

### Prescription Automations
- ✅ Medication adherence reminders (status: `active`)
- ✅ Prescription refill reminders (status: `active`, approaching end)
- ✅ Drug interaction checks (on creation)

---

## 8. API Endpoints Summary

### Appointments
- `POST /api/appointments` - Create appointment
- `GET /api/appointments` - List appointments
- `GET /api/appointments/{id}` - Get appointment
- `PUT /api/appointments/{id}` - Update appointment
- `DELETE /api/appointments/{id}` - Delete appointment
- `GET /api/appointments/{id}/confirm` - Confirm appointment

### Queue
- `POST /api/queue` - Create queue entry
- `GET /api/queue` - Get current queue
- `GET /api/queue/{id}` - Get queue entry
- `PUT /api/queue/{id}` - Update queue
- `POST /api/queue/{id}/check-in` - Check-in patient

### Prescriptions
- `POST /api/prescriptions` - Create prescription
- `GET /api/prescriptions` - List prescriptions
- `GET /api/prescriptions/{id}` - Get prescription
- `PUT /api/prescriptions/{id}` - Update prescription
- `DELETE /api/prescriptions/{id}` - Delete prescription

### Medicines
- `POST /api/medicines` - Create medicine
- `GET /api/medicines` - List medicines
- `GET /api/medicines/{id}` - Get medicine
- `PUT /api/medicines/{id}` - Update medicine
- `DELETE /api/medicines/{id}` - Delete medicine

---

## 9. Status Transition Rules

### Appointment Status Rules
- ✅ `pending` → `scheduled` (always allowed)
- ✅ `scheduled` → `confirmed` (always allowed)
- ✅ `scheduled` → `rescheduled` (always allowed)
- ✅ `scheduled` → `cancelled` (always allowed)
- ✅ `confirmed` → `completed` (always allowed)
- ✅ `confirmed` → `cancelled` (always allowed)
- ✅ `scheduled`/`confirmed` → `no-show` (automatic after time passes)
- ❌ `completed` → any other status (not allowed)
- ❌ `cancelled` → any other status (not allowed)
- ❌ `no-show` → any other status (not allowed)

### Queue Status Rules
- ✅ `waiting` → `in-progress` (always allowed)
- ✅ `waiting` → `cancelled` (always allowed)
- ✅ `in-progress` → `completed` (always allowed)
- ✅ `in-progress` → `cancelled` (always allowed)
- ✅ `waiting` → `no-show` (when called but no response)
- ❌ `completed` → any other status (not allowed)
- ❌ `cancelled` → any other status (not allowed)
- ❌ `no-show` → any other status (not allowed)

### Prescription Status Rules
- ✅ `active` → `dispensed` (when fully dispensed)
- ✅ `active` → `partially-dispensed` (when partially dispensed)
- ✅ `active` → `completed` (when duration expires)
- ✅ `active` → `cancelled` (always allowed)
- ✅ `partially-dispensed` → `dispensed` (when remaining dispensed)
- ✅ `partially-dispensed` → `completed` (when duration expires)
- ✅ `dispensed` → `completed` (when duration expires)
- ❌ `completed` → any other status (not allowed)
- ❌ `cancelled` → any other status (not allowed)

---

## 10. Best Practices

### Appointment Management
1. Always confirm appointments before scheduled time
2. Send reminders 24h and 2h before
3. Handle no-shows promptly
4. Fill cancelled slots from waitlist

### Queue Management
1. Check-in patients promptly
2. Update queue status in real-time
3. Calculate accurate wait times
4. Prioritize confirmed appointments

### Prescription Management
1. Check drug interactions before prescribing
2. Provide clear instructions
3. Set appropriate duration
4. Monitor medication adherence
5. Send refill reminders proactively

### Medicine Management
1. Keep medicine catalog up-to-date
2. Mark inactive medicines promptly
3. Include complete dosage information
4. Update drug interaction data regularly

---

## 11. Troubleshooting

### Common Issues

**Issue:** Appointment stuck in `pending` status
- **Solution:** Update to `scheduled` with date/time

**Issue:** Queue entry not updating
- **Solution:** Check queue status update API call

**Issue:** Prescription reminders not sending
- **Solution:** Verify prescription status is `active` and frequency is set

**Issue:** Medicine not appearing in prescription form
- **Solution:** Check medicine `active` status is `true`

---

This document provides a comprehensive guide to understanding and managing the status journeys for Appointments, Queue, Medications, and Prescriptions in MyClinicSoft.

