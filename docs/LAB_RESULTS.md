# Laboratory Results Management Guide

Complete guide for managing laboratory test orders, results, and third-party lab integrations in MyClinicSoft.

---

## Table of Contents

1. [Overview](#overview)
2. [Lab Result Model](#lab-result-model)
3. [Creating Lab Orders](#creating-lab-orders)
4. [Recording Results](#recording-results)
5. [Third-Party Lab Integration](#third-party-lab-integration)
6. [Patient Notifications](#patient-notifications)
7. [Status Workflow](#status-workflow)
8. [API Reference](#api-reference)
9. [UI Components](#ui-components)
10. [Best Practices](#best-practices)

---

## Overview

MyClinicSoft provides comprehensive laboratory management including:
- **Lab test ordering** by doctors during consultation
- **In-house result recording** for clinic laboratory
- **Third-party lab integration** (API, HL7, manual)
- **Automated patient notifications** (email/SMS)
- **Result interpretation** and review workflow
- **Abnormal value flagging** with reference ranges
- **Attachment support** for PDF/image results

### Supported Lab Test Types

- **Hematology**: CBC, Blood typing, Coagulation studies
- **Clinical Chemistry**: Blood sugar, Lipid profile, Liver/Kidney function
- **Urinalysis**: Routine urinalysis, Urine culture
- **Microbiology**: Blood culture, Sputum culture, Stool exam
- **Immunology**: Hepatitis panel, HIV test, Thyroid function
- **Imaging**: X-ray, Ultrasound, ECG (stored as attachments)
- **Others**: Biopsy, Pap smear, etc.

---

## Lab Result Model

**File**: `models/LabResult.ts`

```typescript
interface ILabResult {
  // Identification
  tenantId?: ObjectId;
  requestCode?: string;              // "LAB-000123"
  
  // Relationships
  patient: ObjectId;                 // → Patient
  visit?: ObjectId;                  // → Visit
  orderedBy?: ObjectId;              // → Doctor/User
  
  // Order Details
  orderDate: Date;
  request: {
    testType: string;                // "CBC", "Urinalysis"
    testCode?: string;               // LOINC code
    description?: string;
    urgency?: 'routine' | 'urgent' | 'stat';
    specialInstructions?: string;
    fastingRequired?: boolean;
    preparationNotes?: string;
  };
  
  // Third-Party Lab
  thirdPartyLab?: {
    labName: string;
    labId?: string;
    labCode?: string;
    integrationType?: 'manual' | 'api' | 'hl7' | 'other';
    apiEndpoint?: string;
    apiKey?: string;
    externalRequestId?: string;
    externalResultId?: string;
    status?: 'pending' | 'sent' | 'received' | 'error';
    sentAt?: Date;
    receivedAt?: Date;
    errorMessage?: string;
  };
  
  // Results
  results?: any;                     // Structured object
  resultDate?: Date;
  interpretation?: string;
  referenceRanges?: any;            // { hb: "12-16 g/dL" }
  abnormalFlags?: Map<string, 'high' | 'low' | 'normal'>;
  
  // Status & Review
  status: 'ordered' | 'in-progress' | 'completed' | 'reviewed' | 'cancelled';
  reviewedBy?: ObjectId;
  reviewedAt?: Date;
  
  // Attachments
  attachments: Array<{
    url: string;
    filename: string;
    size: number;
    mimeType: string;
  }>;
  
  // Notifications
  notificationSent?: boolean;
  notificationSentAt?: Date;
  notificationMethod?: 'email' | 'sms' | 'both';
  
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Creating Lab Orders

### Basic Lab Order

**API Endpoint**: `POST /api/lab-results`

```typescript
const createLabOrder = async (orderData) => {
  const response = await fetch('/api/lab-results', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      patient: '64p123...',
      visit: '64v123...',
      request: {
        testType: 'Complete Blood Count (CBC)',
        testCode: '57021-8',          // LOINC code (optional)
        description: 'Routine CBC for annual checkup',
        urgency: 'routine',
        fastingRequired: false
      },
      orderDate: new Date()
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
    "_id": "64lab123...",
    "requestCode": "LAB-000123",
    "patient": {
      "_id": "64p123...",
      "firstName": "Maria",
      "lastName": "Santos",
      "patientCode": "PAT-000001"
    },
    "request": {
      "testType": "Complete Blood Count (CBC)",
      "urgency": "routine"
    },
    "status": "ordered",
    "orderDate": "2024-02-14T10:00:00Z",
    "orderedBy": {
      "_id": "64u123...",
      "name": "Dr. Juan Cruz"
    }
  }
}
```

### Lab Order with Third-Party Lab

```typescript
const createThirdPartyLabOrder = async (orderData) => {
  const response = await fetch('/api/lab-results', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      patient: '64p123...',
      visit: '64v123...',
      request: {
        testType: 'Lipid Profile',
        urgency: 'routine',
        fastingRequired: true,
        preparationNotes: 'Patient must fast for 8-12 hours before test'
      },
      thirdPartyLab: {
        labName: 'Hi-Precision Diagnostics',
        labCode: 'HIPRE',
        integrationType: 'manual'
      }
    })
  });
  
  return await response.json();
};
```

### STAT/Urgent Lab Order

```typescript
const createStatLabOrder = async (orderData) => {
  const response = await fetch('/api/lab-results', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      patient: '64p123...',
      visit: '64v123...',
      request: {
        testType: 'Troponin I',
        urgency: 'stat',               // High priority
        specialInstructions: 'Suspected MI - process immediately'
      }
    })
  });
  
  return await response.json();
};
```

### Multiple Tests Order

```typescript
// Order multiple tests at once
const testTypes = [
  'Complete Blood Count (CBC)',
  'Urinalysis',
  'Chest X-Ray'
];

const labOrders = await Promise.all(
  testTypes.map(testType => 
    createLabOrder({
      patient: '64p123...',
      visit: '64v123...',
      request: { testType, urgency: 'routine' }
    })
  )
);
```

---

## Recording Results

### In-House Lab Results

**API Endpoint**: `PUT /api/lab-results/:id`

```typescript
const recordLabResults = async (labResultId, resultsData) => {
  const response = await fetch(`/api/lab-results/${labResultId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      status: 'completed',
      resultDate: new Date(),
      results: {
        // Structured results object
        hemoglobin: 14.5,
        hematocrit: 42,
        wbc: 8.5,
        rbc: 4.8,
        platelets: 250
      },
      referenceRanges: {
        hemoglobin: '12-16 g/dL',
        hematocrit: '37-47%',
        wbc: '4.5-11 x10^9/L',
        rbc: '4.2-5.4 x10^12/L',
        platelets: '150-400 x10^9/L'
      },
      abnormalFlags: {
        hemoglobin: 'normal',
        hematocrit: 'normal',
        wbc: 'normal',
        rbc: 'normal',
        platelets: 'normal'
      },
      interpretation: 'All values within normal limits',
      notificationSent: true,
      notificationMethod: 'email'
    })
  });
  
  return await response.json();
};
```

### Abnormal Results with Flags

```typescript
const recordAbnormalResults = async (labResultId) => {
  const response = await fetch(`/api/lab-results/${labResultId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      status: 'completed',
      resultDate: new Date(),
      results: {
        hemoglobin: 9.2,               // Low
        wbc: 15.8,                     // High
        platelets: 120                 // Low
      },
      referenceRanges: {
        hemoglobin: '12-16 g/dL',
        wbc: '4.5-11 x10^9/L',
        platelets: '150-400 x10^9/L'
      },
      abnormalFlags: {
        hemoglobin: 'low',             // Flagged as abnormal
        wbc: 'high',                   // Flagged as abnormal
        platelets: 'low'               // Flagged as abnormal
      },
      interpretation: 'Anemia with leukocytosis and thrombocytopenia. Recommend hematology consult.',
      reviewedBy: '64u123...',
      reviewedAt: new Date()
    })
  });
  
  return await response.json();
};
```

### Uploading Result Attachments

```typescript
const uploadLabResultFile = async (labResultId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`/api/lab-results/${labResultId}/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  return await response.json();
};

// Upload PDF result from third-party lab
await uploadLabResultFile('64lab123...', pdfFile);
```

---

## Third-Party Lab Integration

### Integration Types

1. **Manual**: Staff manually enters results
2. **API**: Automated API integration
3. **HL7**: Health Level 7 messaging
4. **Other**: Custom integration

### Manual Integration

```typescript
// 1. Create order
const order = await createLabOrder({
  patient: '64p123...',
  request: { testType: 'CBC' },
  thirdPartyLab: {
    labName: 'Hi-Precision Diagnostics',
    integrationType: 'manual'
  }
});

// 2. Generate lab request form
const requestForm = await generateLabRequestForm(order._id);
// Print and give to patient

// 3. Patient gets test done at third-party lab

// 4. Patient returns with results, staff uploads PDF
await uploadLabResultFile(order._id, resultsPdf);

// 5. Mark as completed
await recordLabResults(order._id, {
  status: 'completed',
  resultDate: new Date(),
  results: extractedResults,
  thirdPartyLab: {
    ...order.thirdPartyLab,
    status: 'received',
    receivedAt: new Date()
  }
});
```

### API Integration

```typescript
// Configure third-party lab API
const labConfig = {
  labName: 'LabCorp',
  apiEndpoint: 'https://api.labcorp.com/v1',
  apiKey: process.env.LABCORP_API_KEY,
  integrationType: 'api'
};

// 1. Create order and send to third-party lab
const order = await createLabOrder({
  patient: '64p123...',
  request: { testType: 'Lipid Profile' },
  thirdPartyLab: labConfig
});

// 2. Send order to third-party lab via API
const sendToLab = async (labResultId) => {
  const labResult = await LabResult.findById(labResultId);
  
  try {
    const response = await fetch(labResult.thirdPartyLab.apiEndpoint + '/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${labResult.thirdPartyLab.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        patientId: labResult.patient,
        testType: labResult.request.testType,
        urgency: labResult.request.urgency
      })
    });
    
    const data = await response.json();
    
    // Update with external IDs
    await LabResult.findByIdAndUpdate(labResultId, {
      'thirdPartyLab.externalRequestId': data.orderId,
      'thirdPartyLab.status': 'sent',
      'thirdPartyLab.sentAt': new Date(),
      status: 'in-progress'
    });
    
  } catch (error) {
    await LabResult.findByIdAndUpdate(labResultId, {
      'thirdPartyLab.status': 'error',
      'thirdPartyLab.errorMessage': error.message
    });
  }
};

await sendToLab(order._id);

// 3. Webhook receives results from third-party lab
// POST /api/webhooks/lab-results
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Find lab result by external ID
  const labResult = await LabResult.findOne({
    'thirdPartyLab.externalRequestId': body.orderId
  });
  
  if (!labResult) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  
  // Update with results
  await LabResult.findByIdAndUpdate(labResult._id, {
    status: 'completed',
    resultDate: new Date(),
    results: body.results,
    'thirdPartyLab.status': 'received',
    'thirdPartyLab.receivedAt': new Date(),
    'thirdPartyLab.externalResultId': body.resultId
  });
  
  // Send notification to patient
  await sendLabResultNotification(labResult._id);
  
  return NextResponse.json({ success: true });
}
```

### HL7 Integration

```typescript
// HL7 message parsing (requires hl7 library)
import HL7 from 'hl7-standard';

const parseHL7Result = (hl7Message: string) => {
  const msg = new HL7(hl7Message);
  
  const patientId = msg.get('PID.3.1').toString();
  const testType = msg.get('OBR.4.2').toString();
  const results = msg.getSegments('OBX').map(obx => ({
    parameter: obx.get('OBX.3.2').toString(),
    value: obx.get('OBX.5').toString(),
    unit: obx.get('OBX.6').toString(),
    referenceRange: obx.get('OBX.7').toString(),
    flag: obx.get('OBX.8').toString()
  }));
  
  return { patientId, testType, results };
};

// Receive HL7 message via TCP or file
const processHL7Message = async (hl7Message: string) => {
  const parsed = parseHL7Result(hl7Message);
  
  // Find corresponding lab order
  const labResult = await LabResult.findOne({
    patient: parsed.patientId,
    'request.testType': parsed.testType,
    status: { $in: ['ordered', 'in-progress'] }
  });
  
  if (labResult) {
    await recordLabResults(labResult._id, {
      status: 'completed',
      results: parsed.results
    });
  }
};
```

---

## Patient Notifications

### Automatic Email Notification

When results are marked as **completed**, automatic email notification is sent:

```typescript
const sendLabResultNotification = async (labResultId: string) => {
  const labResult = await LabResult.findById(labResultId)
    .populate('patient', 'firstName lastName email')
    .populate('request');
  
  if (!labResult.patient.email) {
    return; // No email available
  }
  
  const emailBody = `
    Dear ${labResult.patient.firstName},
    
    Your lab test results for ${labResult.request.testType} are now available.
    
    Order Date: ${labResult.orderDate.toDateString()}
    Result Date: ${labResult.resultDate.toDateString()}
    
    Please log in to the patient portal to view your results:
    https://clinic.com/patient-portal
    
    If you have any questions, please contact your doctor.
    
    Best regards,
    MyClinic
  `;
  
  await sendEmail({
    to: labResult.patient.email,
    subject: 'Lab Results Available',
    body: emailBody
  });
  
  // Mark as notified
  labResult.notificationSent = true;
  labResult.notificationSentAt = new Date();
  labResult.notificationMethod = 'email';
  await labResult.save();
};
```

### SMS Notification

```typescript
const sendLabResultSMS = async (labResultId: string) => {
  const labResult = await LabResult.findById(labResultId)
    .populate('patient', 'firstName phone');
  
  if (!labResult.patient.phone) {
    return;
  }
  
  const message = `Hi ${labResult.patient.firstName}! Your ${labResult.request.testType} results are ready. Visit https://clinic.com/patient-portal to view. - MyClinic`;
  
  await sendSMS({
    to: labResult.patient.phone,
    message: message
  });
  
  labResult.notificationSent = true;
  labResult.notificationSentAt = new Date();
  labResult.notificationMethod = 'sms';
  await labResult.save();
};
```

### Critical Result Alert

```typescript
const sendCriticalResultAlert = async (labResultId: string) => {
  const labResult = await LabResult.findById(labResultId)
    .populate('patient', 'firstName lastName phone email')
    .populate('orderedBy', 'name phone email');
  
  // Check for critical values
  const hasCriticalValues = Object.values(labResult.abnormalFlags).some(
    flag => flag === 'critical'
  );
  
  if (hasCriticalValues) {
    // Notify doctor immediately
    await sendEmail({
      to: labResult.orderedBy.email,
      subject: `CRITICAL LAB RESULT - ${labResult.patient.firstName} ${labResult.patient.lastName}`,
      body: `Critical lab results detected for patient ${labResult.patient.patientCode}. Please review immediately.`,
      priority: 'high'
    });
    
    // SMS to doctor
    await sendSMS({
      to: labResult.orderedBy.phone,
      message: `CRITICAL: Lab result for ${labResult.patient.firstName} ${labResult.patient.lastName}. Check email.`
    });
    
    // Create system notification
    await createNotification({
      userId: labResult.orderedBy._id,
      type: 'critical-lab-result',
      title: 'Critical Lab Result',
      message: `Patient: ${labResult.patient.firstName} ${labResult.patient.lastName}`,
      data: { labResultId }
    });
  }
};
```

---

## Status Workflow

### Lab Result Lifecycle

```
ordered → in-progress → completed → reviewed
   ↓                                    ↓
cancelled                         (archived)
```

**Status Definitions**:

1. **ordered**: Initial order created by doctor
2. **in-progress**: Sample collected, being processed
3. **completed**: Results available, not yet reviewed by doctor
4. **reviewed**: Doctor has reviewed and interpreted results
5. **cancelled**: Order cancelled before completion

### Status Transitions

```typescript
// ordered → in-progress (when sample collected)
await updateLabResultStatus('64lab123...', 'in-progress');

// in-progress → completed (when results ready)
await updateLabResultStatus('64lab123...', 'completed', {
  results: { ... },
  resultDate: new Date()
});

// completed → reviewed (after doctor review)
await updateLabResultStatus('64lab123...', 'reviewed', {
  reviewedBy: '64u123...',
  reviewedAt: new Date(),
  interpretation: 'Doctor\'s interpretation'
});

// Any status → cancelled
await updateLabResultStatus('64lab123...', 'cancelled');
```

---

## API Reference

### Endpoints

| Endpoint | Method | Description | Access |
|----------|--------|-------------|--------|
| `/api/lab-results` | GET | List lab results | Doctor, Nurse |
| `/api/lab-results` | POST | Create lab order | Doctor |
| `/api/lab-results/:id` | GET | Get lab result details | Doctor, Nurse |
| `/api/lab-results/:id` | PUT | Update/record results | Doctor, Nurse, Lab Tech |
| `/api/lab-results/:id` | DELETE | Cancel lab order | Doctor |
| `/api/lab-results/:id/upload` | POST | Upload result file | Doctor, Nurse, Lab Tech |
| `/api/lab-results/:id/print` | GET | Print lab request form | All staff |

### Query Parameters

**GET /api/lab-results**:
- `patientId`: Filter by patient
- `visitId`: Filter by visit
- `status`: Filter by status
- `orderedBy`: Filter by ordering doctor
- `startDate`, `endDate`: Date range

**Example**:
```
GET /api/lab-results?patientId=64p123&status=completed
```

---

## UI Components

### LabResultsPageClient

**File**: `components/LabResultsPageClient.tsx`

Features:
- List all lab results with filters
- Status badges
- Quick actions (view, upload, review)
- Abnormal value highlighting

### LabResultDetailClient

**File**: `components/LabResultDetailClient.tsx`

Features:
- Full result details
- Structured result display
- Reference range comparison
- Abnormal value flagging
- Interpretation notes
- Attachment viewer
- Review workflow

### LabResultForm

**File**: `components/LabResultForm.tsx`

Features:
- Create lab orders
- Test type selection
- Urgency selection
- Third-party lab configuration
- Special instructions

---

## Best Practices

### 1. Result Entry

✅ **Do**:
- Double-check values before saving
- Use structured result format consistently
- Include reference ranges
- Flag abnormal values
- Add interpretation when appropriate
- Upload original result files as backup

❌ **Don't**:
- Enter results without verification
- Mix units (always specify)
- Skip reference ranges
- Ignore critical values
- Rely solely on manual entry

### 2. Patient Safety

✅ **Do**:
- Review critical results immediately
- Notify doctors of abnormal findings
- Follow up on pending results
- Document all communications
- Maintain audit trail

❌ **Don't**:
- Delay critical result notification
- Skip doctor review for abnormal results
- Release results without review
- Ignore STAT orders

### 3. Third-Party Lab Integration

✅ **Do**:
- Validate data before sending
- Store external IDs for reference
- Handle errors gracefully
- Log all API calls
- Implement retry logic
- Verify result authenticity

❌ **Don't**:
- Expose API keys in logs
- Skip error handling
- Assume integration always works
- Ignore webhook signatures

### 4. Data Quality

```typescript
// Good: Structured results with validation
const results = {
  hemoglobin: parseFloat(value),
  unit: 'g/dL',
  referenceRange: '12-16',
  flag: determineFlag(value, 12, 16)
};

// Bad: Unstructured text
const results = 'Hb: 14.5, normal';
```

### 5. LOINC Codes

Use standardized LOINC codes for interoperability:

```typescript
const commonTests = {
  'CBC': '57021-8',
  'Hemoglobin': '718-7',
  'WBC': '6690-2',
  'Blood Glucose': '2339-0',
  'HbA1c': '4548-4',
  'Creatinine': '2160-0'
};
```

---

## Common Workflows

### 1. Doctor Orders Lab Test During Consultation

```typescript
// During visit
const order = await createLabOrder({
  patient: visit.patient,
  visit: visit._id,
  request: {
    testType: 'Lipid Profile',
    urgency: 'routine',
    fastingRequired: true,
    preparationNotes: 'Fast 8-12 hours before test'
  }
});

// Print lab request form
await printLabRequestForm(order._id);
```

### 2. Patient Gets Test at Third-Party Lab

```typescript
// Patient brings back results
// Staff uploads PDF
await uploadLabResultFile(order._id, pdfFile);

// Staff enters key values
await recordLabResults(order._id, {
  status: 'completed',
  results: {
    totalCholesterol: 180,
    ldl: 100,
    hdl: 60,
    triglycerides: 100
  },
  resultDate: new Date()
});

// Automatic email sent to patient
```

### 3. Doctor Reviews Results

```typescript
// Doctor logs in, sees pending results
const pending = await getLabResults({ status: 'completed' });

// Reviews and interprets
await updateLabResult(pending[0]._id, {
  status: 'reviewed',
  reviewedBy: doctorId,
  reviewedAt: new Date(),
  interpretation: 'Lipid profile within normal limits. Continue current management.'
});
```

---

**Last Updated**: February 14, 2026  
**Version**: 1.0.0
