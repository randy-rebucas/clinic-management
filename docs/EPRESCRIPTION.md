# ePrescription (Electronic Prescription) Features

This document describes the ePrescription features implemented in MyClinicSoft.

## Features Overview

### 1. Auto-fill Medicine List

The prescription form includes intelligent medicine search and auto-fill functionality:

- **Medicine Search**: Type-ahead search for medicines by name, generic name, or brand name
- **Auto-fill**: When a medicine is selected, the form automatically fills:
  - Medicine name and generic name
  - Form (tablet, capsule, syrup, etc.)
  - Strength
  - Route (oral, IV, topical, etc.)
  - Calculated dosage based on patient age and weight
  - Standard frequency
  - Auto-calculated quantity based on frequency and duration

**Usage:**
1. Click "Add Medication"
2. Type in the medicine search field
3. Select a medicine from the dropdown
4. All fields are automatically populated
5. Adjust dosage, frequency, or duration as needed

### 2. Drug Interaction Check

The system includes a comprehensive drug interaction checking system:

#### Basic Interaction Database
- Built-in database of common drug interactions
- Severity levels: Mild, Moderate, Severe, Contraindicated
- Automatic checking when medications are added
- Real-time warnings in the prescription form

#### Advanced API Integration (Optional)
- Support for professional drug interaction APIs
- Configure via environment variables:
  ```env
  DRUG_INTERACTION_API_KEY=your_api_key
  DRUG_INTERACTION_API_URL=https://api.example.com/interactions
  ```
- Falls back to basic checking if API is not configured

#### Features:
- **Automatic Checking**: Interactions are checked automatically when medications are added
- **Manual Check**: "Check Interactions" button for manual verification
- **Patient Medication History**: Checks interactions with patient's current active prescriptions
- **Visual Warnings**: Color-coded severity indicators (red for severe, yellow for moderate, blue for mild)
- **Recommendations**: Provides recommendations for each interaction

**Interaction Severity Levels:**
- **Contraindicated**: Do not use together
- **Severe**: Use with extreme caution, monitor closely
- **Moderate**: Monitor patient, may require dose adjustment
- **Mild**: Minor interaction, monitor patient

### 3. Printable & Digital Prescription

The system supports both printable and digital prescriptions:

#### Print Features:
- **Patient Copy**: Formatted prescription for patient use
- **Clinic Copy**: Formatted prescription for clinic archive
- **Professional Layout**: Clean, professional prescription format
- **Digital Signature**: Includes provider's digital signature
- **Complete Information**: All medication details, patient info, and instructions

#### Print Endpoints:
- Patient Copy: `/api/prescriptions/[id]/print?copy=patient`
- Clinic Copy: `/api/prescriptions/[id]/print?copy=clinic`

#### Digital Prescription:
- Stored in database with full details
- Can be emailed to patients (future feature)
- QR code support (future feature)

### 4. Patient Copy & Clinic Copy Archive

The system tracks both patient and clinic copies:

#### Patient Copy Tracking:
- **Printed At**: Timestamp when patient copy was printed
- **Printed By**: User who printed the copy
- **Digital Copy Sent**: Whether digital copy was sent to patient
- **Sent At**: Timestamp when digital copy was sent

#### Clinic Copy Tracking:
- **Archived At**: Timestamp when clinic copy was archived
- **Archived By**: User who archived the copy
- **Location**: Physical or digital location of archived copy

#### Archive Status Display:
- Shows in prescription detail view
- Tracks both patient and clinic copies separately
- Displays timestamps and user information

## API Endpoints

### Check Drug Interactions
```
POST /api/prescriptions/check-interactions
Body: {
  medications: Array<{ name: string, genericName?: string }>,
  patientId?: string,
  includePatientMedications?: boolean
}
Response: {
  success: boolean,
  data: {
    interactions: Array<DrugInteraction>,
    hasInteractions: boolean,
    severityCounts: {
      contraindicated: number,
      severe: number,
      moderate: number,
      mild: number
    }
  }
}
```

### Print Prescription
```
GET /api/prescriptions/[id]/print?copy=patient|clinic
Returns: HTML printable prescription
```

## Usage Examples

### Creating a Prescription with Auto-fill

1. Navigate to Prescriptions → New Prescription
2. Select a patient
3. Click "Add Medication"
4. Type medicine name in search field
5. Select medicine from dropdown
6. Review auto-filled fields
7. Adjust as needed
8. Add more medications if needed
9. Review drug interaction warnings
10. Add digital signature
11. Submit prescription

### Checking Drug Interactions

**Automatic:**
- Interactions are checked automatically when medications are added
- Warnings appear in real-time above the medications list

**Manual:**
- Click "Check Interactions" button
- System checks all medications in the prescription
- Also checks against patient's current active prescriptions if patient is selected

### Printing Prescriptions

**Patient Copy:**
1. Open prescription detail page
2. Click "Print Patient Copy" button
3. Prescription opens in new window for printing
4. Archive status is automatically updated

**Clinic Copy:**
1. Open prescription detail page
2. Click "Print Clinic Copy" button
3. Prescription opens in new window for printing
4. Archive status is automatically updated

## Drug Interaction Database

The basic interaction database includes common interactions such as:
- Warfarin + Aspirin (severe bleeding risk)
- Warfarin + Ibuprofen (moderate bleeding risk)
- Metformin + Alcohol (lactic acidosis risk)
- Digoxin + Furosemide (hypokalemia risk)
- Lithium + Ibuprofen (increased lithium levels)

**Note:** For production use, consider integrating with a professional drug interaction API for comprehensive coverage.

## Future Enhancements

- Email prescription to patient
- SMS prescription link
- QR code on prescription for verification
- Integration with pharmacy systems
- Electronic prescribing (eRx) to pharmacies
- Medication adherence tracking
- Refill reminders

