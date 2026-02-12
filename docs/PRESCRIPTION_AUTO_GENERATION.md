# Automatic Prescription Generation from Visit Treatment Plan

## Overview
Medications added to a visit's treatment plan are now automatically converted to formal prescription documents. This streamlines the workflow by eliminating the need to manually create prescriptions after documenting a visit.

## How It Works

### 1. Add Medications in Visit Form
When creating or editing a visit, add medications in the **Treatment Plan** tab:
- **Medication Name**: e.g., "Amoxicillin"
- **Dosage**: e.g., "500mg"
- **Frequency**: e.g., "3x daily"
- **Duration**: e.g., "7 days" (supports: days, weeks, months)
- **Instructions**: Optional additional instructions

### 2. Automatic Prescription Creation
When you save the visit:
- A prescription document is **automatically created** with a unique prescription code (RX-XXXXXX)
- Medications are converted to the prescription format
- Digital signature is copied from the visit (if present)
- Patient receives notification (email + in-app) that their prescription is ready

### 3. Prescription Updates
When you update a visit's medications:
- If a prescription exists, it's **automatically updated** with the new medications
- If no prescription exists, a new one is created
- Changes are logged in audit trail

## Data Mapping

Visit medications are mapped to prescription format as follows:

| Visit Field | Prescription Field | Notes |
|-------------|-------------------|-------|
| `name` | `name` | Direct copy |
| `dosage` | `dose` | Direct copy |
| `frequency` | `frequency` | Direct copy |
| `duration` | `durationDays` | Parsed (e.g., "7 days" → 7, "2 weeks" → 14) |
| `instructions` | `instructions` | If empty, auto-generated from other fields |

## Example Workflow

### Step 1: Create Visit with Medications
```typescript
{
  patient: "patient_id",
  visitType: "consultation",
  treatmentPlan: {
    medications: [
      {
        name: "Amoxicillin",
        dosage: "500mg",
        frequency: "3x daily",
        duration: "7 days",
        instructions: "Take with food"
      },
      {
        name: "Ibuprofen",
        dosage: "400mg",
        frequency: "as needed",
        duration: "5 days",
        instructions: "For pain relief"
      }
    ]
  }
}
```

### Step 2: Prescription Auto-Created
```typescript
{
  prescriptionCode: "RX-000123",
  visit: "visit_id",
  patient: "patient_id",
  status: "active",
  medications: [
    {
      name: "Amoxicillin",
      dose: "500mg",
      frequency: "3x daily",
      durationDays: 7,
      instructions: "Take with food"
    },
    {
      name: "Ibuprofen",
      dose: "400mg",
      frequency: "as needed",
      durationDays: 5,
      instructions: "For pain relief"
    }
  ],
  notes: "Generated automatically from visit VISIT-000456"
}
```

## Features

### ✅ Automatic Creation
- Prescriptions are created automatically when visit is saved with medications
- No manual prescription creation needed

### ✅ Smart Updates
- Updating visit medications automatically updates the linked prescription
- Existing prescriptions are reused (no duplicates)

### ✅ Digital Signatures
- Visit signatures are automatically copied to prescriptions
- Maintains compliance and authenticity

### ✅ Notifications
- Patients receive email and in-app notifications when prescriptions are ready
- Notifications include prescription code and medication details

### ✅ Audit Trail
- All auto-generated prescriptions are logged in audit trail
- Marked with `automated: true` flag for tracking

### ✅ Error Handling
- Prescription creation failures don't block visit creation/update
- Errors are logged but visits are still saved successfully

## API Endpoints Affected

### POST /api/visits
- Now triggers automatic prescription creation if `treatmentPlan.medications` exists

### PUT /api/visits/[id]
- Now triggers automatic prescription update/creation if `treatmentPlan.medications` exists

## Backend Implementation

### New File: `lib/automations/prescription-from-visit.ts`
Contains two main functions:

1. **`createPrescriptionFromVisit()`**
   - Creates new prescription from visit medications
   - Generates unique prescription code
   - Copies digital signature
   - Sends notifications

2. **`updatePrescriptionFromVisit()`**
   - Updates existing prescription or creates new one
   - Maintains prescription history
   - Logs all changes

## Duration Parsing

The system intelligently parses duration strings:
- `"7 days"` → 7 days
- `"2 weeks"` → 14 days
- `"1 month"` → 30 days
- `"10 days"` → 10 days

## Notes

- Prescriptions are created **asynchronously** (fire-and-forget) to avoid blocking visit creation
- If prescription creation fails, the visit is still saved successfully
- One prescription per visit (prevents duplicates)
- Existing prescriptions can be updated when visit medications change
- Prescriptions link back to the visit via `visit` field
- Status is set to `active` by default
- Prescription is marked as `printable: true`

## Future Enhancements

Potential improvements:
- [ ] Drug interaction checking before prescription creation
- [ ] Formulary validation (check if medication is in clinic's formulary)
- [ ] Insurance eligibility verification
- [ ] E-prescribing integration (send directly to pharmacy)
- [ ] Refill request handling
- [ ] Medication reconciliation with patient history
