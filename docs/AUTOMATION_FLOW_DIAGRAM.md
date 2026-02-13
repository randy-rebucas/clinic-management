# 🔄 MyClinicSoft Automation Flow Diagram

## Complete Patient Journey with Automations

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        PATIENT CHECK-IN WORKFLOW                         │
└──────────────────────────────────────────────────────────────────────────┘

Step 1: Patient Arrives
│
├─► QUEUE CREATED
│   Status: waiting
│   queuedAt: timestamp
│   patient, doctor, room assigned
│
│
Step 2: Receptionist Records Vitals
│
├─► QUEUE UPDATED
│   vitals: { bp, hr, rr, temp, spo2, height, weight, bmi }
│   Status: still waiting
│
│
Step 3: Doctor Ready → Queue Status Changed
│
├─► QUEUE UPDATED
│   Status: waiting → in-progress
│   startedAt: timestamp
│   calledAt: timestamp
│   │
│   └──► 🤖 AUTOMATION: Queue → Appointment Sync
│        ├─► Appointment status: scheduled → in-progress
│        ├─► checkedInAt: timestamp
│        └─► ✅ SUCCESS (non-blocking)
│
│
Step 4: Start Visit Button Clicked
│
├─► VISIT CREATED
│   Status: open
│   openedAt: timestamp
│   patient: pre-populated from queue
│   vitals: auto-filled from queue vitals ✨
│   │
│   └──► 🤖 AUTOMATION: Visit → Queue Sync
│        ├─► Queue status: in-progress (already set, no change)
│        └─► ✅ SUCCESS (non-blocking)
│
│
Step 5: Doctor Documents Visit
│
├─► VISIT UPDATED
│   chiefComplaint: entered
│   diagnosis: entered
│   treatmentPlan.medications: added
│   followUpDate: set (optional)
│
│
Step 6: Close Visit Button Clicked
│
├─► VISIT UPDATED
│   Status: open → closed
│   closedAt: timestamp
│   │
│   ├──► 🤖 AUTOMATION 1: Visit → Queue Sync
│   │    ├─► Queue status: in-progress → completed
│   │    ├─► completedAt: timestamp
│   │    └─► ✅ SUCCESS
│   │
│   ├──► 🤖 AUTOMATION 2: Queue → Appointment Sync
│   │    ├─► Triggered by Queue status change
│   │    ├─► Appointment status: in-progress → completed
│   │    ├─► completedAt: timestamp
│   │    └─► ✅ SUCCESS
│   │
│   ├──► 🤖 AUTOMATION 3: Visit → Prescription
│   │    ├─► IF medications exist in treatmentPlan
│   │    ├─► Create Prescription
│   │    ├─► prescriptionCode: RX-000001
│   │    ├─► Send notification to patient
│   │    └─► ✅ SUCCESS
│   │
│   ├──► 🤖 AUTOMATION 4: Visit → Invoice
│   │    ├─► Create Invoice
│   │    ├─► invoiceNumber: INV-000001
│   │    ├─► Calculate: consultation + procedures + discounts + tax
│   │    ├─► Send notification to patient
│   │    └─► ✅ SUCCESS
│   │
│   ├──► 🤖 AUTOMATION 5: Visit → Follow-up Appointment
│   │    ├─► IF followUpDate is set
│   │    ├─► Create Appointment
│   │    ├─► appointmentCode: APT-000002
│   │    ├─► appointmentDate: visit.followUpDate
│   │    ├─► Send notification to patient
│   │    └─► ✅ SUCCESS
│   │
│   └──► 🤖 AUTOMATION 6: Visit → Summary
│        ├─► Generate visit summary
│        ├─► Include: diagnosis, prescriptions, lab results
│        ├─► Send via SMS and Email to patient
│        └─► ✅ SUCCESS
│
│
└─► FINAL STATE:
    ├─► Queue: completed ✓
    ├─► Appointment: completed ✓
    ├─► Visit: closed ✓
    ├─► Prescription: active ✓
    ├─► Invoice: unpaid ✓
    ├─► Follow-up Appointment: scheduled ✓
    └─► Patient notified via SMS/Email ✓
```

---

## Bidirectional Sync Protection

```
┌────────────────────────────────────────────────────────────────────────┐
│                  CIRCULAR DEPENDENCY PREVENTION                        │
└────────────────────────────────────────────────────────────────────────┘

Scenario: Queue status changed directly
│
├─► API: PUT /api/queue/[id]
│   Body: { status: 'completed' }
│   _skipAutomation: false (not set by user)
│   │
│   ├─► Queue updated: status = 'completed'
│   │
│   └─► 🤖 Trigger Automation: Queue → Appointment
│       ├─► Check: _skipAutomation = false ✓
│       ├─► Update Appointment:
│       │   ├─► status: 'completed'
│       │   ├─► _skipAutomation: true ✨ (FLAG SET)
│       │   └─► completedAt: timestamp
│       │
│       └─► API: PUT /api/appointments/[id] (internal)
│           Body: { status: 'completed', _skipAutomation: true }
│           │
│           ├─► Appointment updated
│           │
│           └─► 🤖 Check Automation: Appointment → Queue
│               ├─► Check: _skipAutomation = true ✓
│               ├─► ⏭️ SKIP automation (prevent circular loop)
│               └─► ✅ No infinite loop!

═══════════════════════════════════════════════════════════════════════

Scenario: Appointment status changed directly
│
├─► API: PUT /api/appointments/[id]
│   Body: { status: 'completed' }
│   _skipAutomation: false (not set by user)
│   │
│   ├─► Appointment updated: status = 'completed'
│   │
│   └─► 🤖 Trigger Automation: Appointment → Queue
│       ├─► Check: _skipAutomation = false ✓
│       ├─► Update Queue:
│       │   ├─► status: 'completed'
│       │   ├─► _skipAutomation: true ✨ (FLAG SET)
│       │   └─► completedAt: timestamp
│       │
│       └─► API: PUT /api/queue/[id] (internal)
│           Body: { status: 'completed', _skipAutomation: true }
│           │
│           ├─► Queue updated
│           │
│           └─► 🤖 Check Automation: Queue → Appointment
│               ├─► Check: _skipAutomation = true ✓
│               ├─► ⏭️ SKIP automation (prevent circular loop)
│               └─► ✅ No infinite loop!
```

---

## Status Mapping Reference

```
┌────────────────────────────────────────────────────────────────────────┐
│                        STATUS MAPPING TABLE                            │
└────────────────────────────────────────────────────────────────────────┘

┌──────────────┬─────────────────┬────────────────────┐
│    VISIT     │     QUEUE       │    APPOINTMENT     │
├──────────────┼─────────────────┼────────────────────┤
│     open     │  in-progress    │   in-progress      │
│    closed    │   completed     │    completed       │
│  cancelled   │   cancelled     │    cancelled       │
│   no-show*   │    no-show      │     no-show        │
└──────────────┴─────────────────┴────────────────────┘

* no-show status for Visit is RECOMMENDED to be added

┌─────────────────────────────────────────────────────────────────────┐
│               QUEUE → APPOINTMENT MAPPING                           │
├─────────────────────┬───────────────────────────────────────────────┤
│  Queue Status       │  Appointment Status                           │
├─────────────────────┼───────────────────────────────────────────────┤
│  waiting            │  scheduled                                    │
│  in-progress        │  in-progress                                  │
│  completed          │  completed                                    │
│  cancelled          │  cancelled                                    │
│  no-show            │  no-show                                      │
└─────────────────────┴───────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│               APPOINTMENT → QUEUE MAPPING                           │
├─────────────────────┬───────────────────────────────────────────────┤
│  Appointment Status │  Queue Status                                 │
├─────────────────────┼───────────────────────────────────────────────┤
│  scheduled          │  waiting                                      │
│  confirmed          │  waiting                                      │
│  checked-in         │  waiting                                      │
│  in-progress        │  in-progress                                  │
│  completed          │  completed                                    │
│  cancelled          │  cancelled                                    │
│  no-show            │  no-show                                      │
└─────────────────────┴───────────────────────────────────────────────┘
```

---

## Automation Files Location

```
lib/automations/
├── appointment-from-queue.ts    ✅ Queue → Appointment sync
├── queue-from-appointment.ts    ✨ Appointment → Queue sync (NEW)
├── prescription-from-visit.ts   ✅ Visit → Prescription
├── invoice-generation.ts        ✅ Visit → Invoice
├── followup-scheduling.ts       ✅ Visit → Follow-up Appointment
├── visit-summaries.ts           ✅ Visit → SMS/Email Summary
├── waitlist-management.ts       ✅ Cancelled Appointment → Waitlist
├── smart-assignment.ts          ✅ Auto-assign doctors
├── queue-optimization.ts        ✅ Queue optimization
├── insurance-verification.ts    ✅ Insurance auto-verify
└── ... (28 more automation modules)

API Integration Points:
├── app/api/queue/[id]/route.ts           (Queue → Appointment trigger)
├── app/api/appointments/[id]/route.ts    (Appointment → Queue trigger) ⚠️ TO BE ADDED
└── app/api/visits/[id]/route.ts          (Visit → Queue, Prescription, Invoice, etc.)
```

---

## Error Handling Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                      AUTOMATION ERROR HANDLING                         │
└────────────────────────────────────────────────────────────────────────┘

User Action: Close Visit
│
├─► API: PUT /api/visits/[id]
│   Body: { status: 'closed' }
│   │
│   ├─► ✅ Visit updated successfully (PRIMARY OPERATION)
│   │   └─► User sees: 200 OK response immediately
│   │
│   ├─► 🤖 Trigger Automations (async, non-blocking):
│   │
│   ├─── Automation 1: Visit → Queue
│   │    ├─► ✅ Success → Queue updated
│   │    └─► ❌ Failure → Logged, PRIMARY OPERATION not affected
│   │
│   ├─── Automation 2: Queue → Appointment
│   │    ├─► ✅ Success → Appointment updated
│   │    └─► ❌ Failure → Logged, PRIMARY OPERATION not affected
│   │
│   ├─── Automation 3: Prescription Creation
│   │    ├─► ✅ Success → Prescription created
│   │    └─► ❌ Failure → Logged, PRIMARY OPERATION not affected
│   │
│   ├─── Automation 4: Invoice Generation
│   │    ├─► ✅ Success → Invoice created
│   │    └─► ❌ Failure → Logged, PRIMARY OPERATION not affected
│   │
│   ├─── Automation 5: Follow-up Appointment
│   │    ├─► ✅ Success → Follow-up scheduled
│   │    └─► ❌ Failure → Logged, PRIMARY OPERATION not affected
│   │
│   └─── Automation 6: Visit Summary
│        ├─► ✅ Success → SMS/Email sent
│        └─► ❌ Failure → Logged, PRIMARY OPERATION not affected
│
│
KEY PRINCIPLE: Automation failures are NON-BLOCKING
├─► Primary user action ALWAYS succeeds
├─► Automations run asynchronously with .catch()
├─► Errors logged to console, not thrown to user
└─► Partial failures handled gracefully
```

---

## Console Log Examples

```bash
# ✅ Successful Automation Flow
[Queue API] Queue status changed from 'waiting' to 'in-progress'
[Appointment Automation] ✅ Appointment 507f1f77bcf86cd799439011 status updated to 'in-progress' (from queue 507f191e810c19729de860ea)

# ⏭️ Skipped Automation (Circular Prevention)
[Queue API] ⏭️ Skipping appointment automation (triggered by appointment update)

# ℹ️ No Related Record Found
[Appointment Automation] ℹ️ No active appointment found for patient 507f1f77bcf86cd799439011 (queue 507f191e810c19729de860ea)

# ❌ Automation Error (Non-blocking)
[Appointment Automation] ❌ Error updating appointment from queue:
Error: Cast to ObjectId failed for value "invalid" at path "_id"
[Visit API] Visit updated successfully (automation error did not affect visit update)
```

---

## Testing Guide

### Quick Test: Queue → Appointment Sync

```bash
# 1. Start dev server
npm run dev

# 2. Open browser console
# 3. Update queue status via API:

fetch('http://myclinic.localhost:3000/api/queue/YOUR_QUEUE_ID', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': 'your-session-cookie'
  },
  body: JSON.stringify({
    status: 'completed'
  })
})

# 4. Check terminal console for:
# [Queue API] Queue status changed from 'in-progress' to 'completed'
# [Appointment Automation] ✅ Appointment X status updated to 'completed'

# 5. Verify in database:
db.appointments.findOne({ patient: ObjectId("...") })
# Should show status: 'completed', completedAt: timestamp
```

### Full Integration Test

1. **Check-in patient** → Queue created (waiting)
2. **Record vitals** → Queue updated with vitals
3. **Change queue to in-progress** → Appointment updates to in-progress ✓
4. **Start visit** → Visit created with pre-filled vitals ✓
5. **Add medications** → Treatment plan updated
6. **Close visit** → Triggers 6 automations:
   - Queue → completed ✓
   - Appointment → completed ✓
   - Prescription created ✓
   - Invoice generated ✓
   - Follow-up scheduled ✓
   - Summary sent ✓

---

## Next Steps

1. ✅ **COMPLETED:** Queue → Appointment sync implemented
2. ✅ **COMPLETED:** Circular dependency prevention added
3. ⚠️ **PENDING:** Integrate Appointment → Queue sync (see docs/AUTOMATION_SYSTEM_REVIEW.md Task 1)
4. ⚠️ **RECOMMENDED:** Add no-show status to Visit model
5. ⚠️ **OPTIONAL:** Add status timestamps to Visit model

---

**For detailed implementation guides, see:**
- `docs/AUTOMATION_SYSTEM_REVIEW.md` - Complete system review
- `models/RELATIONSHIPS.md` - Data model relationships
- `README.md` - Main project documentation
