# Clinical Visit Management

A **Visit** is the core clinical record created each time a patient is seen by a provider. It captures the chief complaint, diagnoses, clinical notes, and links to prescriptions and lab orders generated during the encounter.

---

## Accessing Visits

Go to **Visits** in the sidebar to see all recorded visits. You can search by patient name, visit code, or date.

### Filtering Visits

| Filter | Description |
|---|---|
| **Date range** | Show visits within a specific period |
| **Doctor / Provider** | Filter by the attending provider |
| **Status** | Filter by visit completion status |
| **Search** | Search by patient name or visit code |

---

## Creating a New Visit

Visits are typically created in one of two ways:

### From the Queue (Recommended)
1. Go to **Queue**.
2. Find the patient whose status is **Waiting** or **In Progress**.
3. Click **Start Visit** (or open the patient row and click the visit link).
4. A new visit is pre-populated with the patient and queue vitals.

### From the Visits Page
1. Go to **Visits → New Visit**.
2. Search for and select the **Patient**.
3. Fill in the visit details.

---

## Visit Form Fields

### Basic Information

| Field | Description |
|---|---|
| **Patient** | Required — the patient being seen |
| **Doctor / Provider** | The attending provider |
| **Visit Date** | Defaults to today |
| **Visit Type** | Consultation, Follow-up, Emergency, Procedure, etc. |
| **Associated Appointment** | Link to an existing appointment (optional) |

### Chief Complaint

Enter the primary reason the patient is visiting in the **Chief Complaint** field. This is a free-text field (e.g., "persistent cough for 3 days", "follow-up for hypertension").

### Diagnoses

Add one or more diagnoses to the visit:

1. Click **Add Diagnosis**.
2. Search by ICD-10 code or description (autocomplete is available).
3. Select the matching diagnosis from the suggestions.
4. Check **Primary Diagnosis** for the main finding.
5. Repeat to add secondary diagnoses.

Multiple diagnoses can be added to a single visit. The primary diagnosis is highlighted in reports and summaries.

### Clinical Notes

Use the **Notes** field for SOAP notes, physical examination findings, treatment plans, or any other free-text documentation.

### Vitals

If vitals were recorded in the Queue, they are automatically pulled into the visit. You can view and update them here:

- Blood Pressure, Heart Rate, Respiratory Rate, Temperature, SpO₂, Height, Weight, BMI.

### Follow-up

Set a **Follow-up Date** if the patient needs to return. This date appears on the visit summary and can trigger follow-up reminders.

---

## Visit Statuses

| Status | Meaning |
|---|---|
| **In Progress** | Visit is open and being documented |
| **Completed** | Documentation is finished; visit is closed |
| **Cancelled** | Visit was cancelled or patient left |

---

## Provider Sign-off

To finalize a visit, the provider adds a **Digital Signature**:

1. Scroll to the **Signature** section.
2. Enter the provider name in the signature field.
3. Click **Sign Visit**.

Once signed, the visit is timestamped with the provider name and sign time. Signed visits are marked as completed.

---

## Linking Actions to a Visit

From within an open visit, you can directly create linked records:

| Action | Result |
|---|---|
| **New Prescription** | Creates a prescription linked to this visit |
| **New Lab Order** | Creates a lab order linked to this visit |
| **New Referral** | Creates a referral linked to this visit |
| **New Invoice** | Opens the invoice form pre-linked to this visit |

All linked records appear in the patient's profile under their respective tabs.

---

## Viewing Visit History

From the **Patient Profile**, click the **Visits** tab to see a chronological list of all past visits. Each entry shows:
- Visit code and date
- Provider name
- Chief complaint summary
- Primary diagnosis
- Status

Click any visit to open the full record.

---

## Tips

- Always link visits to an appointment or queue entry when possible — this creates a clean audit trail.
- The ICD-10 search in the Diagnoses field supports both code lookup (e.g., J06.9) and text search (e.g., "upper respiratory").
- Set a follow-up date for patients with chronic conditions to ensure they return on schedule.
- Visits cannot be deleted to preserve the medical record. If an error was made, edit the visit and document the correction in the notes field.
