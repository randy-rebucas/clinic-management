# E-Prescriptions

The Prescriptions module lets doctors create electronic prescriptions, track dispensing, and manage medication history for each patient.

---

## Accessing Prescriptions

Go to **Prescriptions** in the sidebar. The list shows all prescriptions across patients, with search and filter controls.

### Filtering

| Filter | Description |
|---|---|
| **Search** | Search by patient name or prescription code |
| **Status** | Filter by prescription status (Active, Dispensed, Expired, Cancelled) |
| **Date range** | Filter by issue date |

---

## Creating a Prescription

### From a Visit (Recommended)

1. Open the patient's **Visit** record.
2. Click **New Prescription** within the visit.
3. The prescription is automatically linked to the visit.

### Standalone

1. Go to **Prescriptions** in the sidebar.
2. Click **New Prescription**.
3. Search for and select the **Patient**.
4. Optionally link to an existing **Visit**.

---

## Prescription Form

### Header Information

| Field | Description |
|---|---|
| **Patient** | Required — the receiving patient |
| **Doctor / Provider** | The prescribing provider (defaults to logged-in doctor) |
| **Associated Visit** | Link this prescription to a visit (optional) |
| **Issue Date** | Defaults to today |

### Adding Medications

Click **Add Medication** for each item in the prescription.

| Field | Description |
|---|---|
| **Medication Name** | Name of the drug (autocomplete from the medicines database) |
| **Dose** | Dosage amount (e.g., 500mg) |
| **Frequency** | How often taken (e.g., 3 times a day, every 8 hours) |
| **Duration** | Number of days to take the medication |
| **Quantity** | Total units to dispense |
| **Instructions** | Special instructions (e.g., take with food, avoid sunlight) |

Repeat for each medication. A single prescription can contain multiple medications.

### Checking Drug Interactions

Before saving, click **Check Interactions** to run an automated drug–drug interaction check across all medications in the prescription. Review any warnings before proceeding.

---

## Prescription Statuses

| Status | Meaning |
|---|---|
| **Active** | Issued and valid for dispensing |
| **Dispensed** | Fully dispensed by a pharmacy |
| **Partially Dispensed** | Some medications have been given out |
| **Expired** | Past the validity period |
| **Cancelled** | Voided by the prescribing doctor |

---

## Dispensing History

Each prescription records dispensing events when a pharmacy fulfills it:

| Field | Description |
|---|---|
| **Pharmacy Name** | Where the medication was dispensed |
| **Dispensed Date** | When it was given out |
| **Quantity Dispensed** | How many units were dispensed |

This history is visible in the prescription detail view and is useful for tracking partial fills.

---

## Printing a Prescription

1. Open the prescription.
2. Click **Print**.
3. A print-ready prescription document opens with clinic letterhead, patient details, medications, and doctor signature line.

---

## Deleting a Prescription

Only users with the **delete prescriptions** permission (typically the prescribing doctor or an admin) can delete a prescription.

1. Open the prescription.
2. Click **Delete**.
3. Confirm the deletion.

> Deleted prescriptions are removed from the active list but may be retained in audit logs.

---

## Tips

- Always use the autocomplete in the **Medication Name** field to select from the clinic's verified medicines database. This ensures accurate drug interaction checks.
- The **Quantity** field should reflect the total units to be dispensed, not the daily dose. For example, if the patient takes 1 tablet 3× daily for 7 days, quantity = 21.
- Prescriptions linked to a visit appear under the **Prescriptions** tab of the patient profile and in the visit detail.
