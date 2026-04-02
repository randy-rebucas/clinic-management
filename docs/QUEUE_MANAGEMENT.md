# Queue Management

The Queue is the real-time patient flow management system. It tracks patients from arrival through consultation, allows nurses to record vitals, and lets doctors see who is next.

---

## Opening the Queue

Go to **Queue** in the sidebar. The page shows all patients currently in the queue for today.

---

## Queue Entry Types

| Type | Description |
|---|---|
| **Appointment** | Patient arrived for a scheduled appointment |
| **Walk-in** | Patient arrived without a prior appointment |
| **Follow-up** | Patient returning for a follow-up visit |

---

## Queue Statuses

| Status | Meaning |
|---|---|
| **Waiting** | Patient has arrived and is in line |
| **In Progress** | Patient is currently being seen |
| **Completed** | Visit is finished |
| **Cancelled** | Patient left or entry was removed |
| **No-show** | Patient did not arrive |

---

## Adding a Patient to the Queue

### From an Appointment
When a patient with a scheduled appointment arrives:
1. Open **Queue** or **Appointments**.
2. Find the appointment and click **Check In**.
3. The patient is added to the queue with a queue number.

### Manual Entry (Walk-in)
1. On the Queue page, click **Add to Queue**.
2. Search for and select the patient (register them first if new).
3. Select a doctor (optional).
4. Select the queue type (Walk-in, Follow-up).
5. Click **Add**.

A queue number is assigned automatically in sequential order.

---

## Filtering the Queue

| Filter | Description |
|---|---|
| **Doctor** | Show only the queue for a specific doctor |
| **Queue Type** | Filter by Appointment, Walk-in, or Follow-up |
| **Status** | Active (Waiting + In Progress), or All statuses |
| **Search** | Find a patient by name |

---

## Recording Vitals

Nurses record vital signs before the patient sees the doctor.

1. Find the patient in the queue.
2. Click **Record Vitals** (or the vitals icon on the queue row).
3. Fill in the available fields:

| Vital | Unit |
|---|---|
| **Blood Pressure (BP)** | mmHg (e.g., 120/80) |
| **Heart Rate (HR)** | beats per minute |
| **Respiratory Rate (RR)** | breaths per minute |
| **Temperature** | °C |
| **Oxygen Saturation (SpO₂)** | % |
| **Height** | cm |
| **Weight** | kg |
| **BMI** | Calculated automatically from height and weight |

4. Click **Save Vitals**.

Vitals are attached to the queue entry and become available in the clinical visit record.

---

## Updating Queue Status

As the patient moves through the clinic:

1. Find the patient in the queue.
2. Click the **Status** control on their row.
3. Select the new status (e.g., In Progress, Completed).

> Marking a patient as **In Progress** signals to all staff that the patient is currently being seen.

---

## Priority Assignment

For urgent cases, you can bump a patient to higher priority:
1. Open the queue entry.
2. Set the **Priority** field to High or Urgent.
3. Save.

High-priority patients are displayed with a visual indicator and sorted toward the top.

---

## Queue Display Board

A public-facing queue display is available for waiting rooms at `/api/queue/display`. It shows queue numbers and statuses without requiring a login.

> Ask your administrator for the display URL and configure it on a screen in your waiting area.

---

## Tips

- Nurses should record vitals **before** marking a patient as In Progress so the doctor sees the values when opening the visit.
- The queue resets at midnight. Only today's entries are shown by default.
- Walk-in appointments automatically appear in the queue — you do not need to manually add them if created through the Appointments page with the walk-in flag enabled.
