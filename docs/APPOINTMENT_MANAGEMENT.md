# Appointment Management

The Appointments section lets you schedule, view, and manage patient appointments. It supports multiple view modes, walk-in handling, and real-time queue integration.

---

## Viewing Appointments

Go to **Appointments** in the sidebar. Three view modes are available:

| View | Description |
|---|---|
| **Calendar** | Visual monthly/weekly/daily calendar of all appointments |
| **List** | Tabular list of appointments with filters |
| **Queue** | Live patient queue tied to today's appointments |

Switch between views using the tabs at the top of the page.

### Filtering the List View

| Filter | Description |
|---|---|
| **Date range** | Show appointments within specific dates |
| **Doctor** | Filter by an assigned doctor |
| **Room** | Filter by examination room |
| **Status** | Filter by appointment status |

---

## Appointment Statuses

| Status | Meaning |
|---|---|
| **Pending** | Created but not yet confirmed |
| **Scheduled** | Confirmed and on the calendar |
| **Confirmed** | Patient has confirmed attendance |
| **Rescheduled** | Appointment moved to a new time |
| **Completed** | Patient was seen; visit is done |
| **No-show** | Patient did not attend |
| **Cancelled** | Appointment was cancelled |

---

## Scheduling a New Appointment

1. Click **New Appointment** (top-right of the Appointments page).
2. Fill in the form:

### Required Fields

| Field | Description |
|---|---|
| **Patient** | Search and select the patient (must be registered first) |
| **Doctor** | Select the attending doctor |
| **Date** | Pick the appointment date |
| **Time** | Pick the start time |

### Optional Fields

| Field | Description |
|---|---|
| **Room** | Assign an examination room |
| **Duration** | Appointment length in minutes (defaults to clinic setting) |
| **Reason** | Brief reason for the visit |
| **Notes** | Internal notes visible to clinical staff |

3. Click **Save** to create the appointment.

An appointment code (`APT-######`) is generated automatically.

---

## Walk-in Appointments

Walk-in patients skip the scheduling step and are added directly to the queue.

1. Go to **Appointments → New Appointment** and enable the **Walk-in** toggle, **or** go to **Queue → Add to Queue**.
2. Select or register the patient.
3. Select a doctor (optional for unassigned walk-ins).
4. The patient is added to the queue and assigned a queue number automatically.

---

## Editing an Appointment

1. Click the appointment in the list or calendar to open it.
2. Click **Edit**.
3. Modify the date, time, doctor, room, or notes.
4. Click **Save**.

> Changing the date or time automatically updates the status to **Rescheduled**.

---

## Cancelling or Marking No-show

1. Open the appointment.
2. Click the **Status** dropdown.
3. Select **Cancelled** or **No-show**.
4. Confirm.

Cancelled appointments remain in the system for audit purposes.

---

## Appointment Reminders

If email is configured in **Settings → Notifications**, patients with an email address automatically receive:
- A confirmation email when the appointment is created.
- A reminder email before the appointment date.

---

## Tips

- Use the **Calendar view** to spot scheduling gaps and avoid overbooking.
- The default appointment duration (e.g., 30 minutes) is set in **Settings → Appointments**.
- Walk-ins automatically receive a queue number. The queue page shows estimated wait times.
- Appointments marked **Completed** are linked to the patient's visit record.
