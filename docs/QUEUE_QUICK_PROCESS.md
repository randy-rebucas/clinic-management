# Queue Management - Quick Process Flow

## 🎯 Quick Visual Reference

### Entry → Check-In → Consultation → Complete

```
┌─────────────────────────────────────────────────────────────┐
│                    QUEUE ENTRY CREATION                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │ Appointment  │   │   Walk-In    │   │  Follow-Up   │
    │   Move to    │   │   Register   │   │   Verify &   │
    │    Queue     │   │   Patient    │   │     Add      │
    └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
           └──────────────────┼──────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              QUEUE NUMBER GENERATED                         │
│         A/W/F-YYYYMMDD-NNN (e.g., A20260212-001)           │
│    Status: waiting | Priority: 0-2 | Checked In: false    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    PATIENT CHECK-IN                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │    Manual    │   │   QR Code    │   │    Kiosk     │
    │ Staff Clicks │   │ Patient Scans│   │ Self-Service │
    │  Check In    │   │   at Desk    │   │   Terminal   │
    └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
           └──────────────────┼──────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│           WAITING IN QUEUE (Status: waiting)                │
│      🔄 Auto-refresh: 30s | Wait Time: 15 min × position   │
└─────────────────────────────────────────────────────────────┘
                              ↓
                      Doctor Ready?
                              ↓
┌─────────────────────────────────────────────────────────────┐
│            CONSULTATION (Status: in-progress)               │
│  Timer Started | Patient with Doctor | Room Assigned       │
└─────────────────────────────────────────────────────────────┘
                              ↓
           ┌──────────────────┴──────────────────┐
           ↓                  ↓                   ↓
    ┌──────────┐      ┌──────────┐       ┌──────────┐
    │ Lab Tests│      │ePrescribe│       │ Follow-Up│
    │  Ordered │      │  Written │       │ Scheduled│
    └──────────┘      └──────────┘       └──────────┘
           └──────────────────┬──────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│          CONSULTATION COMPLETE (Status: completed)          │
│    Timer Stopped | Duration Recorded | Next Action Set     │
└─────────────────────────────────────────────────────────────┘
                              ↓
           ┌──────────────────┴──────────────────┐
           ↓                  ↓                   ↓
    ┌──────────┐      ┌──────────┐       ┌──────────┐
    │ Billing  │      │ Pharmacy │       │ Checkout │
    │ Invoice  │      │   Meds   │       │  Direct  │
    └──────────┘      └──────────┘       └──────────┘
           └──────────────────┬──────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│        ARCHIVE & AUDIT TRAIL | Update Appointment          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚦 Status Flow Diagram

```
┌──────────┐
│ waiting  │ ──────Check In────→ Patient in waiting area
└────┬─────┘
     │
     │ Doctor Ready
     ↓
┌──────────┐
│in-progress│ ─────Consulting────→ Patient with doctor
└────┬─────┘
     │
     │ Finish
     ↓
┌──────────┐
│completed │ ───────Done────────→ Archive & next steps
└──────────┘

Special Cases:
┌──────────┐
│ no-show  │ ──Patient Left/Didn't Show
└──────────┘
┌──────────┐
│cancelled │ ──Removed from Queue
└──────────┘
```

---

## 🎚️ Priority System

```
┌─────────────────────────────────────┐
│  🔴 URGENT (Priority 2)             │ ← Top of Queue
│     Emergency / Critical            │
├─────────────────────────────────────┤
│  🟡 HIGH (Priority 1)               │
│     Serious / Time-Sensitive        │
├─────────────────────────────────────┤
│  🟢 NORMAL (Priority 0)             │ ← Default
│     Regular Appointments/Walk-Ins   │
└─────────────────────────────────────┘
```

**Queue Order Logic:**
1. Sort by Priority (2 → 1 → 0)
2. Then by Check-In Time (earliest first)
3. Then by Appointment vs Walk-In (appointments first)

---

## 📱 Check-In Methods Comparison

| Method | Speed | Staff Required | Equipment | Best For |
|--------|-------|----------------|-----------|----------|
| **Manual** | ⭐⭐⭐ | Yes | Computer | All patients |
| **QR Code** | ⭐⭐⭐⭐⭐ | No | QR Scanner | Tech-savvy patients |
| **Kiosk** | ⭐⭐⭐⭐ | No | Touch Screen | High volume clinics |

---

## 🎯 Key Actions by Role

### Receptionist
- ✅ Add patients to queue
- ✅ Check in patients (manual/QR)
- ✅ Assign doctors/rooms
- ✅ Set priority levels
- ✅ View queue status
- ❌ Complete consultations

### Nurse
- ✅ Check in patients
- ✅ Update queue status
- ✅ Start consultations
- ✅ Call patients
- ✅ Complete simple visits
- ⚠️ Cancel (with reason)

### Doctor
- ✅ View assigned patients
- ✅ Start consultations
- ✅ Complete consultations
- ✅ Set priorities
- ✅ Optimize queue
- ✅ All nurse actions

### Admin
- ✅ All actions
- ✅ Delete queue entries
- ✅ Override system rules
- ✅ Access analytics
- ✅ Configure settings

---

## ⏱️ Time Tracking

```
Patient Timeline:
├─ Created: 09:00 AM
├─ Checked In: 09:05 AM (5 min)
├─ Called: 09:20 AM (15 min wait)
├─ Started: 09:22 AM (2 min to room)
├─ Completed: 09:42 AM (20 min consultation)
└─ Checked Out: 09:50 AM (8 min billing/pharmacy)

Total Time in Clinic: 50 minutes
Actual Wait Time: 15 minutes
Consultation Time: 20 minutes
```

---

## 🔔 Notifications & Alerts

### Patient Notifications
- ✉️ **Queue Position SMS**: "You are #3 in queue. Est. wait: 30 min"
- ✉️ **Near Turn SMS**: "You're next! Please be ready."
- ✉️ **Called SMS**: "Please proceed to Room 101"

### Staff Notifications
- 🔔 **Long Wait Alert**: "Patient A-003 waiting over 60 minutes"
- 🔔 **Queue Full**: "Queue has 15+ patients waiting"
- 🔔 **No-Show**: "Patient A-005 marked as no-show"
- 🔔 **Emergency**: "Urgent patient A-008 added to queue"

---

## 📊 Queue Display Screen Layout

```
┌───────────────────────────────────────────────┐
│        CLINIC QUEUE MANAGEMENT                │
│                                               │
│  NOW SERVING:  A-005  Room 101               │
│  ═══════════════════════════════════════════  │
│                                               │
│  WAITING:                                     │
│  ┌───────────────────────────────────┐       │
│  │ 🔴 A-006  Est. 15 min             │       │
│  │ 🟡 W-001  Est. 30 min             │       │
│  │ 🟢 A-007  Est. 45 min             │       │
│  │ 🟢 W-002  Est. 60 min             │       │
│  └───────────────────────────────────┘       │
│                                               │
│  Avg Wait: 22 min | Patients Today: 42      │
└───────────────────────────────────────────────┘
```

---

## 🛠️ Quick Troubleshooting

### Problem: Patient not in queue
**Check:**
1. Correct date selected?
2. Filters hiding patient?
3. Patient checked out already?
4. Wrong tenant/clinic?

**Solution:** Clear filters, refresh, search by name

---

### Problem: Long wait times
**Check:**
1. Number of available doctors
2. Queue optimization needed
3. Consultations running long
4. Too many non-appointments

**Solution:** Run optimization, add doctor, adjust scheduling

---

### Problem: Check-in not working
**Check:**
1. QR code expired?
2. Patient already checked in?
3. Wrong queue entry?
4. Network issue?

**Solution:** Manual check-in, verify queue ID, retry

---

## 📈 Performance Metrics

**Good Queue Management:**
- ✅ Average wait < 30 minutes
- ✅ No-show rate < 10%
- ✅ Doctor utilization > 80%
- ✅ Patient satisfaction > 4.5/5

**Warning Signs:**
- ⚠️ Wait times > 60 minutes
- ⚠️ Queue length > 15 patients
- ⚠️ No-show rate > 20%
- ⚠️ Multiple complaints

**Action Required:**
- 🚨 Wait times > 90 minutes
- 🚨 Queue length > 25 patients
- 🚨 System errors/downtime
- 🚨 Multiple emergencies

---

## 💡 Best Practices

### For Efficient Queue Flow:
1. ✅ Check in patients immediately on arrival
2. ✅ Update status promptly
3. ✅ Use priority system appropriately
4. ✅ Run optimization during peak hours
5. ✅ Monitor wait times actively
6. ✅ Communicate delays to patients
7. ✅ Complete consultations in system
8. ✅ Archive old entries regularly

### For Better Patient Experience:
1. ✅ Display clear wait time estimates
2. ✅ Keep public display updated
3. ✅ Notify patients when turn is near
4. ✅ Provide comfortable waiting area
5. ✅ Explain delays proactively
6. ✅ Offer beverages/wifi
7. ✅ Show compassion for long waits
8. ✅ Gather feedback regularly

---

## 🔗 Related Documentation

- [Full Queue Workflow](./QUEUE_WORKFLOW.md) - Complete technical documentation
- [Appointment & Queue Integration](./APPOINTMENT_QUEUE_WORKFLOW.md) - End-to-end workflow
- [Queue Management Guide](./QUEUE_MANAGEMENT.md) - Feature documentation
- [Staff Quick Reference](./APPOINTMENT_QUEUE_QUICK_REFERENCE.md) - Quick actions guide

---

**Quick Access Commands:**
- View Queue: Navigate to Dashboard → Queue
- Add to Queue: Appointments → Move to Queue
- Check-In: Queue View → Check In button
- Optimize: Queue View → Optimize button
- Reports: Dashboard → Queue Analytics

---

**Last Updated:** February 12, 2026  
**For:** Staff Training & Daily Operations  
**Print this page for easy reference at reception desk**
