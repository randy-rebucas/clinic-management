# Appointment & Queue Quick Reference Guide

## 🎯 Quick Actions

### Schedule an Appointment
1. Click **"Schedule Appointment"** button
2. Search and select patient
3. Choose doctor/provider
4. Set date and time
5. Add duration, room, and reason
6. Click **"Create Appointment"**

### Add Walk-In Patient
1. Click **"Add Walk-In"** button
2. Search and select patient
3. Choose doctor (if known)
4. Add reason for visit
5. Click **"Create Appointment"**
6. Patient automatically gets queue number

### Move Appointment to Queue
1. Find appointment (scheduled or confirmed status)
2. Click **"Move to Queue"** button
3. Patient added to queue system
4. Queue number displayed in success message

### Check In Patient
**Option 1 - Manual:**
1. Go to Queue view
2. Find patient entry
3. Click **"Check In"** button

**Option 2 - QR Code:**
1. Patient scans QR code at kiosk
2. System auto-checks in

### Update Queue Status
1. Find patient in Queue view
2. Select new status:
   - **Waiting** - In queue, not yet seen
   - **In Progress** - Currently with doctor
   - **Completed** - Consultation done
   - **No-Show** - Patient left
3. Click update

---

## 📊 View Modes

### Calendar View
- See appointments on calendar
- Click date to view that day's appointments
- Color-coded status badges

### List View
- All appointments in table format
- Sort by any column
- Quick action buttons

### Queue View
- Today's walk-in queue
- Real-time updates (auto-refresh every 30s)
- Shows queue numbers and wait times

---

## 🔍 Filters

### Filter Options:
- **By Doctor** - Show specific doctor's appointments
- **By Room** - Show appointments in specific room
- **By Date** - Calendar selection
- **By Status** - Filter queue items
- **By Type** - Appointment, Walk-In, or Follow-Up

### Clear Filters:
Click **"Clear Filters"** button to reset

---

## 🎨 Status Colors

### Appointment Status:
- 🔵 **Scheduled** - Newly created appointment
- 🟢 **Confirmed** - Patient confirmed attendance
- ⚫ **Completed** - Consultation finished
- 🔴 **Cancelled** - Appointment cancelled
- 🟡 **No-Show** - Patient didn't arrive
- 🟣 **Pending** - Awaiting confirmation
- 🟠 **Rescheduled** - Moved to different time

### Queue Status:
- 🟡 **Waiting** - In queue
- 🔵 **In Progress** - With doctor now
- 🟢 **Completed** - Done
- 🔴 **No-Show** - Left queue

---

## ⚡ Keyboard Shortcuts

### Patient Search:
- ↓ **Arrow Down** - Next patient
- ↑ **Arrow Up** - Previous patient
- ↵ **Enter** - Select highlighted patient
- **Esc** - Close search dropdown

---

## 🔔 Priority Levels

- **0** - Normal (default)
- **1** - High Priority
- **2** - Urgent

**Note:** Higher priority patients appear first in queue

---

## 📱 Queue Number Format

- **A-YYYYMMDD-001** - Appointments
- **W-YYYYMMDD-001** - Walk-Ins
- **F-YYYYMMDD-001** - Follow-Ups

Example: `A20260212-001` = Appointment on Feb 12, 2026, number 001

---

## ⏱️ Wait Time Calculation

**Formula:** 15 minutes × queue position

Example:
- Position 1 = 15 min wait
- Position 2 = 30 min wait
- Position 3 = 45 min wait

---

## ❗ Common Issues

### "Patient not found" Error
✅ **Solution:** Ensure patient exists in system first

### Cannot Move to Queue
✅ **Solution:** Appointment must be scheduled or confirmed status

### Patient Search Not Working
✅ **Solution:** Type at least 2 characters to search

### Queue Not Updating
✅ **Solution:** Page auto-refreshes every 30s, or click refresh button

---

## 💡 Pro Tips

1. **Always confirm appointments** before patient arrival
2. **Use Move to Queue** for scheduled patients who arrive early
3. **Check in walk-ins immediately** when they arrive
4. **Update status promptly** to keep queue accurate
5. **Use filters** to focus on specific doctors/rooms
6. **Monitor wait times** and adjust as needed

---

## 🔐 Permissions Required

### To Schedule Appointments:
- Role: Doctor, Nurse, Receptionist
- Permission: `appointments:write`

### To Manage Queue:
- Role: Doctor, Nurse, Receptionist
- Permission: `queue:write`

### To View Only:
- Permission: `appointments:read` or `queue:read`

---

## 📞 Support Quick Reference

### Need Help?
1. Check [Full Workflow Documentation](./APPOINTMENT_QUEUE_WORKFLOW.md)
2. Contact IT support
3. Check audit logs for troubleshooting
4. Refer to training materials

---

## 🔄 Workflow Summary

```
SCHEDULED APPOINTMENT
↓
Confirm → Move to Queue → Check In → In Progress → Complete

WALK-IN PATIENT
↓
Add Walk-In → (Optional) Move to Queue → Check In → In Progress → Complete
```

---

**Last Updated:** February 12, 2026  
**Version:** 1.0
