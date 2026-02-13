# Prescription Management Guide

Complete guide for e-prescribing, medication management, drug interaction checking, and pharmacy dispensing in MyClinicSoft.

---

## Table of Contents

1. [Overview](#overview)
2. [Prescription Model](#prescription-model)
3. [Creating Prescriptions](#creating-prescriptions)
4. [Medication Details](#medication-details)
5. [Drug Interaction Checking](#drug-interaction-checking)
6. [Digital Signatures](#digital-signatures)
7. [Pharmacy Dispensing](#pharmacy-dispensing)
8. [Prescription Printing](#prescription-printing)
9. [API Reference](#api-reference)
10. [UI Components](#ui-components)
11. [Best Practices](#best-practices)

---

## Overview

MyClinicSoft provides a comprehensive e-prescribing system with:
- **Electronic prescriptions** with auto-generated codes
- **Medication database integration** for accurate dosing
- **Drug interaction checks** for patient safety
- **Digital signatures** for legal compliance
- **Pharmacy dispensing tracking** with multiple fills
- **Copy management** (patient copy and clinic archive)
- **Multi-tenant support** with tenant-scoped data

### Prescription Workflow

```
Consultation → Create Prescription → Check Interactions → Digital Sign → Print → Dispense → Archive
                                          ↓
                                     Alert if severe
```

---

## Prescription Model

**File**: `models/Prescription.ts`

```typescript
interface IPrescription {
  // Identification
  tenantId?: ObjectId;
  prescriptionCode: string;           // "RX-000123"
  
  // Relationships
  visit?: ObjectId;                   // → Visit
  patient: ObjectId;                  // → Patient
  prescribedBy?: ObjectId;            // → User (Doctor)
  
  // Medications
  medications: Array<{
    medicineId?: ObjectId;            // → Medicine catalog
    name: string;                     // "Amoxicillin"
    genericName?: string;             // "Amoxicillin"
    form?: string;                    // tablet, capsule, syrup
    strength?: string;                // "500 mg"
    dose?: string;                    // "500 mg"
    route?: string;                   // oral, iv, topical
    frequency?: string;               // "TID" (3x daily)
    durationDays?: number;            // 7 days
    quantity?: number;                // 21 tablets
    instructions?: string;            // "Take with food"
    calculatedDosage?: {
      dose: string;
      frequency: string;
      totalDailyDose?: string;
      instructions?: string;
    };
  }>;
  
  notes?: string;
  status: 'active' | 'completed' | 'cancelled' | 'dispensed' | 'partially-dispensed';
  issuedAt: Date;
  
  // Pharmacy Dispensing
  pharmacyDispenses?: Array<{
    pharmacyId?: string;
    pharmacyName?: string;
    dispensedAt?: Date;
    dispensedBy?: string;
    quantityDispensed?: number;
    notes?: string;
    trackingNumber?: string;
  }>;
  
  // Digital Signature
  digitalSignature?: {
    providerName: string;
    signatureData: string;            // Base64 signature image
    signedAt: Date;
  };
  
  printable: boolean;
  
  // Copy Tracking
  copies?: {
    patientCopy?: {
      printedAt?: Date;
      printedBy?: ObjectId;
      digitalCopySent?: boolean;
      sentAt?: Date;
    };
    clinicCopy?: {
      archivedAt?: Date;
      archivedBy?: ObjectId;
      location?: string;
    };
  };
  
  // Drug Interaction Alerts
  drugInteractions?: Array<{
    medication1: string;
    medication2: string;
    severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
    description: string;
    recommendation?: string;
    checkedAt: Date;
  }>;
  
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Creating Prescriptions

### Basic Prescription

**API Endpoint**: `POST /api/prescriptions`

```typescript
const createPrescription = async (prescriptionData) => {
  const response = await fetch('/api/prescriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      patient: '64p123...',
      visit: '64v123...',
      prescribedBy: '64u123...',
      issuedAt: new Date(),
      medications: [
        {
          name: 'Amoxicillin',
          genericName: 'Amoxicillin',
          form: 'capsule',
          strength: '500 mg',
          dose: '500 mg',
          route: 'oral',
          frequency: 'TID',
          durationDays: 7,
          quantity: 21,
          instructions: 'Take 1 capsule 3 times daily with food'
        },
        {
          name: 'Paracetamol',
          genericName: 'Acetaminophen',
          form: 'tablet',
          strength: '500 mg',
          dose: '500 mg',
          route: 'oral',
          frequency: 'q4-6h PRN',
          durationDays: 3,
          quantity: 12,
          instructions: 'Take as needed for fever or pain, every 4-6 hours'
        }
      ],
      notes: 'Patient reports penicillin allergy - confirmed safe',
      status: 'active'
    })
  });
  
  return await response.json();
};
```

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "64p123...",
    "prescriptionCode": "RX-000123",
    "patient": {
      "_id": "64p123...",
      "firstName": "Maria",
      "lastName": "Santos",
      "patientCode": "PAT-000001"
    },
    "prescribedBy": {
      "_id": "64u123...",
      "name": "Dr. Juan dela Cruz",
      "email": "juan@clinic.com"
    },
    "medications": [
      {
        "name": "Amoxicillin",
        "strength": "500 mg",
        "frequency": "TID",
        "durationDays": 7,
        "quantity": 21
      }
    ],
    "status": "active",
    "issuedAt": "2024-02-14T10:00:00Z",
    "createdAt": "2024-02-14T10:00:00Z"
  }
}
```

### Prescription from Medicine Catalog

```typescript
const createPrescriptionFromCatalog = async (patientId, visitId, medicineIds) => {
  // 1. Fetch medicines from catalog
  const medicines = await getMedicines(medicineIds);
  
  // 2. Build medications array with default dosing
  const medications = medicines.map(medicine => ({
    medicineId: medicine._id,
    name: medicine.brandName || medicine.genericName,
    genericName: medicine.genericName,
    form: medicine.form,
    strength: medicine.strength,
    dose: medicine.recommendedDose || medicine.strength,
    route: medicine.defaultRoute || 'oral',
    frequency: medicine.defaultFrequency || 'BID',
    durationDays: medicine.defaultDurationDays || 7,
    quantity: calculateQuantity(medicine.defaultFrequency, medicine.defaultDurationDays),
    instructions: medicine.defaultInstructions
  }));
  
  // 3. Create prescription
  const response = await fetch('/api/prescriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      patient: patientId,
      visit: visitId,
      medications: medications,
      status: 'active'
    })
  });
  
  return await response.json();
};

// Helper: Calculate quantity based on frequency and duration
const calculateQuantity = (frequency, durationDays) => {
  const frequencyMap = {
    'OD': 1,    // Once daily
    'BID': 2,   // Twice daily
    'TID': 3,   // Three times daily
    'QID': 4,   // Four times daily
    'q4h': 6,   // Every 4 hours
    'q6h': 4,   // Every 6 hours
    'q8h': 3,   // Every 8 hours
    'q12h': 2   // Every 12 hours
  };
  
  const timesPerDay = frequencyMap[frequency] || 1;
  return timesPerDay * durationDays;
};
```

---

## Medication Details

### Dosage Frequency Codes

| Code | Meaning | Times/Day |
|------|---------|-----------|
| OD / QD | Once daily | 1 |
| BID | Twice daily | 2 |
| TID | Three times daily | 3 |
| QID | Four times daily | 4 |
| q4h | Every 4 hours | 6 |
| q6h | Every 6 hours | 4 |
| q8h | Every 8 hours | 3 |
| q12h | Every 12 hours | 2 |
| PRN | As needed | Variable |
| AC | Before meals | 3 |
| PC | After meals | 3 |
| HS | At bedtime | 1 |

### Route of Administration

- **oral**: By mouth (most common)
- **iv**: Intravenous
- **im**: Intramuscular
- **sc**: Subcutaneous
- **topical**: Applied to skin
- **ophthalmic**: Eye drops
- **otic**: Ear drops
- **inhalation**: Inhaled
- **rectal**: Rectal
- **sublingual**: Under tongue

### Dosage Forms

- **tablet**: Solid oral tablet
- **capsule**: Gelatin capsule
- **syrup**: Liquid syrup
- **suspension**: Liquid suspension
- **solution**: Liquid solution
- **injection**: Injectable
- **cream**: Topical cream
- **ointment**: Topical ointment
- **drops**: Eye/ear drops
- **inhaler**: Metered-dose inhaler
- **patch**: Transdermal patch

---

## Drug Interaction Checking

### Check Interactions

```typescript
const checkDrugInteractions = async (medications) => {
  const response = await fetch('/api/prescriptions/check-interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      medications: medications.map(m => ({
        name: m.name,
        genericName: m.genericName
      }))
    })
  });
  
  const result = await response.json();
  return result.interactions || [];
};
```

**Response**:
```json
{
  "success": true,
  "interactions": [
    {
      "medication1": "Warfarin",
      "medication2": "Aspirin",
      "severity": "severe",
      "description": "Increased risk of bleeding when taken together",
      "recommendation": "Avoid concurrent use. Consider alternative anticoagulation.",
      "checkedAt": "2024-02-14T10:05:00Z"
    }
  ]
}
```

### Severity Levels

**Contraindicated**: DO NOT prescribe together
- Example: Warfarin + Aspirin (bleeding risk)
- Action: Alert doctor, prevent prescription

**Severe**: Serious interaction, avoid if possible
- Example: ACE inhibitors + Potassium supplements (hyperkalemia)
- Action: Alert doctor, recommend alternative

**Moderate**: Monitor closely if prescribed together
- Example: Metformin + Alcohol (lactic acidosis risk)
- Action: Warning, document monitoring plan

**Mild**: Minor interaction, minimal clinical significance
- Example: Calcium + Iron supplements (reduced absorption)
- Action: Informational note

### Handling Interactions

```typescript
const handleInteractionAlert = async (prescriptionId, interactions) => {
  // Filter severe and contraindicated interactions
  const criticalInteractions = interactions.filter(
    i => i.severity === 'severe' || i.severity === 'contraindicated'
  );
  
  if (criticalInteractions.length > 0) {
    // Show alert to doctor
    const proceed = await showInteractionAlert(criticalInteractions);
    
    if (!proceed) {
      // Cancel prescription
      return null;
    }
  }
  
  // Save interactions to prescription
  await updatePrescription(prescriptionId, {
    drugInteractions: interactions
  });
  
  return prescriptionId;
};
```

---

## Digital Signatures

### Add Digital Signature

```typescript
const addDigitalSignature = async (prescriptionId, signatureData) => {
  const response = await fetch(`/api/prescriptions/${prescriptionId}/sign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      providerName: 'Dr. Juan dela Cruz',
      signatureData: signatureData,  // Base64 image
      signedAt: new Date()
    })
  });
  
  return await response.json();
};
```

### Capture Signature (Canvas)

```typescript
// React component for signature capture
const SignatureCapture = ({ onSave }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  const startDrawing = (e) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };
  
  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  };
  
  const stopDrawing = () => {
    setIsDrawing(false);
  };
  
  const saveSignature = () => {
    const canvas = canvasRef.current;
    const signatureData = canvas.toDataURL('image/png');
    onSave(signatureData);
  };
  
  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        style={{ border: '1px solid #ccc' }}
      />
      <button onClick={saveSignature}>Save Signature</button>
    </div>
  );
};
```

---

## Pharmacy Dispensing

### Record Dispensing

**API Endpoint**: `POST /api/prescriptions/:id/dispense`

```typescript
const recordDispensing = async (prescriptionId, dispenseData) => {
  const response = await fetch(`/api/prescriptions/${prescriptionId}/dispense`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      pharmacyId: 'PHARM001',
      pharmacyName: 'MyClinic Pharmacy',
      dispensedAt: new Date(),
      dispensedBy: 'Pharmacist Maria Santos',
      quantityDispensed: 21,
      trackingNumber: 'DISP-2024-001',
      notes: 'Full prescription dispensed'
    })
  });
  
  return await response.json();
};
```

### Partial Dispensing

```typescript
// First dispense: 10 tablets
await recordDispensing(prescriptionId, {
  pharmacyName: 'MyClinic Pharmacy',
  quantityDispensed: 10,
  notes: 'Partial dispense - remaining stock to follow'
});

// Prescription status: 'partially-dispensed'

// Second dispense: 11 tablets (completing prescription)
await recordDispensing(prescriptionId, {
  pharmacyName: 'MyClinic Pharmacy',
  quantityDispensed: 11,
  notes: 'Final dispense - prescription completed'
});

// Prescription status: 'dispensed'
```

### Check Dispensing Status

```typescript
const getDispenseHistory = async (prescriptionId) => {
  const response = await fetch(`/api/prescriptions/${prescriptionId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const prescription = await response.json();
  
  // Calculate total dispensed
  const totalDispensed = prescription.pharmacyDispenses?.reduce(
    (sum, d) => sum + (d.quantityDispensed || 0), 
    0
  ) || 0;
  
  const totalPrescribed = prescription.medications.reduce(
    (sum, m) => sum + (m.quantity || 0),
    0
  );
  
  return {
    totalPrescribed,
    totalDispensed,
    remaining: totalPrescribed - totalDispensed,
    status: prescription.status,
    dispenses: prescription.pharmacyDispenses
  };
};
```

---

## Prescription Printing

### Print Prescription

**API Endpoint**: `GET /api/prescriptions/:id/print`

```typescript
const printPrescription = async (prescriptionId) => {
  // 1. Mark as printed
  await fetch(`/api/prescriptions/${prescriptionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      'copies.patientCopy.printedAt': new Date(),
      'copies.patientCopy.printedBy': userId
    })
  });
  
  // 2. Open print preview
  window.open(`/api/prescriptions/${prescriptionId}/print`, '_blank');
};
```

### Prescription Template

```html
<!DOCTYPE html>
<html>
<head>
  <title>Prescription - RX-000123</title>
  <style>
    @media print {
      /* A5 size for prescription pad */
      @page { size: A5 portrait; margin: 1cm; }
    }
    body { font-family: Arial, sans-serif; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
    .clinic-name { font-size: 18px; font-weight: bold; }
    .doctor-info { font-size: 12px; margin-top: 5px; }
    .patient-info { margin-top: 20px; }
    .rx-symbol { font-size: 36px; font-weight: bold; margin: 20px 0; }
    .medication { margin-bottom: 15px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
    .signature { margin-top: 40px; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <div class="clinic-name">MyClinic Health Center</div>
    <div class="doctor-info">Dr. Juan dela Cruz, MD | License No: 12345</div>
    <div class="doctor-info">123 Main Street, Manila | Tel: (02) 1234-5678</div>
  </div>
  
  <div class="patient-info">
    <strong>Patient:</strong> Maria Santos (PAT-000001)<br>
    <strong>Date:</strong> February 14, 2024<br>
    <strong>Rx No:</strong> RX-000123
  </div>
  
  <div class="rx-symbol">℞</div>
  
  <div class="medication">
    <strong>1. Amoxicillin 500 mg capsule</strong><br>
    Sig: Take 1 capsule 3 times daily with food<br>
    Disp: #21 capsules<br>
    Duration: 7 days
  </div>
  
  <div class="medication">
    <strong>2. Paracetamol 500 mg tablet</strong><br>
    Sig: Take as needed for fever or pain, every 4-6 hours<br>
    Disp: #12 tablets<br>
    Duration: 3 days
  </div>
  
  <div class="signature">
    <img src="data:image/png;base64,..." alt="Signature" width="150"><br>
    <strong>Dr. Juan dela Cruz</strong><br>
    License No: 12345
  </div>
</body>
</html>
```

### Send Digital Copy (Email/SMS)

```typescript
const sendDigitalCopy = async (prescriptionId, deliveryMethod) => {
  const response = await fetch(`/api/prescriptions/${prescriptionId}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      method: deliveryMethod,  // 'email' or 'sms'
      includeAttachment: true  // PDF attachment
    })
  });
  
  // Update prescription
  await fetch(`/api/prescriptions/${prescriptionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      'copies.patientCopy.digitalCopySent': true,
      'copies.patientCopy.sentAt': new Date()
    })
  });
  
  return await response.json();
};
```

---

## API Reference

### Endpoints

| Endpoint | Method | Description | Access |
|----------|--------|-------------|--------|
| `/api/prescriptions` | GET | List prescriptions | Doctor, Nurse |
| `/api/prescriptions` | POST | Create prescription | Doctor |
| `/api/prescriptions/:id` | GET | Get prescription details | Doctor, Nurse, Pharmacist |
| `/api/prescriptions/:id` | PUT | Update prescription | Doctor |
| `/api/prescriptions/:id` | DELETE | Cancel prescription | Doctor, Admin |
| `/api/prescriptions/:id/sign` | POST | Add digital signature | Doctor |
| `/api/prescriptions/:id/dispense` | POST | Record dispensing | Pharmacist |
| `/api/prescriptions/:id/print` | GET | Print prescription | Doctor, Nurse |
| `/api/prescriptions/check-interactions` | POST | Check drug interactions | Doctor |

### Query Parameters

**GET /api/prescriptions**:
- `patientId`: Filter by patient
- `visitId`: Filter by visit
- `status`: Filter by status (`active`, `dispensed`, `completed`, `cancelled`)
- `startDate`, `endDate`: Date range

---

## UI Components

### PrescriptionForm

**File**: `components/PrescriptionForm.tsx`

Features:
- Medicine catalog search
- Add/remove medications
- Dosage calculator
- Frequency picker
- Drug interaction checker
- Digital signature capture

### PrescriptionDetailClient

**File**: `components/PrescriptionDetailClient.tsx`

Features:
- Full prescription details
- Medication list
- Dispensing history
- Print prescription
- Send digital copy
- Cancel/void

### PharmacyDispenseClient

**File**: `components/PharmacyDispenseClient.tsx`

Features:
- Pending prescriptions queue
- Scan prescription QR code
- Record dispensing
- Partial dispense handling
- Inventory integration

---

## Best Practices

### 1. Prescription Creation

✅ **Do**:
- Check patient allergies before prescribing
- Run drug interaction checks
- Include clear instructions
- Specify duration and quantity
- Use generic names when possible
- Add digital signature for legal compliance

❌ **Don't**:
- Prescribe without checking allergies
- Skip drug interaction checks
- Use ambiguous dosing instructions
- Forget to specify duration
- Prescribe expired medications

### 2. Drug Interaction Checking

✅ **Do**:
- Always check before prescribing
- Review patient's current medications
- Alert on severe interactions
- Document override reasons
- Monitor patient closely

❌ **Don't**:
- Skip interaction checks
- Ignore warnings
- Prescribe contraindicated combinations
- Forget to document

### 3. Dosage Safety

```typescript
// Good: Age-appropriate dosing
const calculatePediatricDose = (weightKg, adultDose) => {
  // Clark's Rule: (Weight in kg / 70) × Adult dose
  return (weightKg / 70) * adultDose;
};

// Good: Renal function adjustment
const adjustForRenalFunction = (dose, creatinineClearance) => {
  if (creatinineClearance < 30) {
    return dose * 0.5;  // Reduce by 50%
  } else if (creatinineClearance < 50) {
    return dose * 0.75; // Reduce by 25%
  }
  return dose;
};
```

### 4. Pharmacy Dispensing

✅ **Do**:
- Verify prescription authenticity
- Check expiry dates
- Counsel patient on usage
- Record dispensing accurately
- Update inventory
- Provide written instructions

❌ **Don't**:
- Dispense without verification
- Skip patient counseling
- Forget to update inventory
- Dispense expired medications

### 5. Documentation

```typescript
// Good: Complete medication record
const medication = {
  name: 'Amoxicillin',
  genericName: 'Amoxicillin',
  form: 'capsule',
  strength: '500 mg',
  dose: '500 mg',
  route: 'oral',
  frequency: 'TID',
  durationDays: 7,
  quantity: 21,
  instructions: 'Take 1 capsule 3 times daily with food. Complete full course even if feeling better.'
};

// Bad: Incomplete information
const medication = {
  name: 'Amoxicillin',
  dose: '500 mg'
};
```

---

## Common Workflows

### 1. Post-Consultation Prescription

```typescript
// After consultation completed

// 1. Check patient allergies
const allergies = await getPatientAllergies(patientId);

// 2. Create prescription
const prescription = await createPrescription({
  patient: patientId,
  visit: visitId,
  medications: [
    {
      name: 'Amoxicillin',
      strength: '500 mg',
      frequency: 'TID',
      durationDays: 7,
      quantity: 21,
      instructions: 'Take with food'
    }
  ]
});

// 3. Check drug interactions
const interactions = await checkDrugInteractions(prescription.medications);

if (interactions.some(i => i.severity === 'severe')) {
  // Alert doctor
  const proceed = await confirmInteraction(interactions);
  if (!proceed) {
    await cancelPrescription(prescription._id);
    return;
  }
}

// 4. Add digital signature
await addDigitalSignature(prescription._id, signatureData);

// 5. Print prescription
await printPrescription(prescription._id);

// 6. Send digital copy
await sendDigitalCopy(prescription._id, 'email');
```

### 2. Pharmacy Dispensing Workflow

```typescript
// At pharmacy counter

// 1. Scan or enter prescription code
const prescription = await getPrescriptionByCode('RX-000123');

// 2. Verify patient identity
const patientVerified = await verifyPatient(prescription.patient);

// 3. Check stock availability
const available = await checkInventory(prescription.medications);

if (!available) {
  // Partial dispense or notify shortage
  await notifyShortage(prescription._id);
  return;
}

// 4. Counsel patient
await logPatientCounseling(prescription._id);

// 5. Record dispensing
await recordDispensing(prescription._id, {
  pharmacyName: 'MyClinic Pharmacy',
  dispensedBy: pharmacistId,
  quantityDispensed: getTotalQuantity(prescription.medications)
});

// 6. Update inventory
await updateInventory(prescription.medications);

// 7. Print dispensing label
await printDispensingLabel(prescription._id);
```

---

**Last Updated**: February 14, 2026  
**Version**: 1.0.0
