# Laboratory & Diagnostic Requests System

This document describes the Laboratory & Diagnostic Requests features implemented in MyClinicSoft.

## Features Overview

### 1. Digital Request Forms

The system provides comprehensive digital lab request forms with the following features:

- **Auto-generated Request Codes**: Unique identifiers (LAB-000001, LAB-000002, etc.)
- **Structured Request Data**: 
  - Test type and code (e.g., LOINC codes)
  - Test description
  - Urgency level (routine, urgent, stat)
  - Special instructions
  - Fasting requirements
  - Preparation notes

- **Printable Format**: Professional HTML request forms
- **Clinical Context**: Includes patient info, diagnosis, chief complaint
- **Digital Signature Support**: Provider signature on request forms

**API Endpoint:**
- `GET /api/lab-results/[id]/request-form` - Generate printable lab request form

### 2. Third-Party Lab Integration (Optional)

The system supports integration with external laboratory systems:

#### Integration Types:
- **Manual**: Manual entry of results from external labs
- **API**: RESTful API integration
- **HL7**: HL7 message format support (placeholder)
- **Other**: Custom integration methods

#### Features:
- **Lab Configuration**: Store lab credentials and endpoints
- **Request Sending**: Send lab requests to third-party labs via API
- **Result Receiving**: Webhook endpoint to receive results automatically
- **Status Tracking**: Track request status (pending, sent, received, error)
- **External IDs**: Map internal request codes to external lab IDs

**API Endpoints:**
- `POST /api/lab-results/third-party/send` - Send request to third-party lab
- `POST /api/lab-results/third-party/webhook` - Receive results from third-party lab

**Integration Utilities:**
- `lib/lab-integration.ts` - Helper functions for lab integration
  - `sendLabRequestToThirdParty()` - Send requests via API
  - `receiveLabResultFromThirdParty()` - Process received results
  - `handleLabResultWebhook()` - Process webhook payloads
  - `processHL7Message()` - HL7 message processing (placeholder)

### 3. Lab Result Upload & Viewing

The system provides comprehensive lab result management:

#### Result Upload:
- **File Upload**: Upload lab result PDFs, images, or documents
- **Structured Data Entry**: Enter results as structured data
- **Multiple Attachments**: Support for multiple result files
- **Automatic Status Update**: Status changes to "completed" when results are uploaded

#### Result Viewing:
- **Patient History**: View all lab results for a patient
- **Visit Association**: Link results to specific visits
- **Structured Results**: View results in structured format
- **Reference Ranges**: Display normal ranges for each test
- **Abnormal Flags**: Highlight abnormal values (high/low)
- **Interpretation**: Clinical interpretation of results

**API Endpoints:**
- `GET /api/lab-results` - List lab results (filters: patientId, visitId, status)
- `POST /api/lab-results` - Create new lab request
- `GET /api/lab-results/[id]` - Get lab result details
- `PUT /api/lab-results/[id]` - Update lab result
- `POST /api/lab-results/[id]/upload` - Upload result file

### 4. Result Notifications to Patient

The system automatically notifies patients when lab results are available:

#### Notification Methods:
- **Email**: Send email notification with result summary
- **SMS**: Send SMS notification (via Twilio)
- **Both**: Send both email and SMS

#### Notification Features:
- **Automatic Tracking**: Tracks when notifications are sent
- **Notification History**: Records notification method and timestamp
- **Status Updates**: Updates lab result with notification status
- **Patient Contact Info**: Uses patient's email and/or phone

**API Endpoint:**
- `POST /api/lab-results/[id]/notify` - Send notification to patient

**Request Body:**
```json
{
  "method": "email" | "sms" | "both"
}
```

## LabResult Model

The enhanced LabResult model includes:

```typescript
{
  visit: ObjectId (optional),
  patient: ObjectId (required),
  orderedBy: ObjectId,
  orderDate: Date,
  requestCode: string (unique),
  request: {
    testType: string,
    testCode: string,
    description: string,
    urgency: 'routine' | 'urgent' | 'stat',
    specialInstructions: string,
    fastingRequired: boolean,
    preparationNotes: string
  },
  thirdPartyLab: {
    labName: string,
    labId: string,
    labCode: string,
    integrationType: 'manual' | 'api' | 'hl7' | 'other',
    apiEndpoint: string,
    apiKey: string,
    externalRequestId: string,
    externalResultId: string,
    status: 'pending' | 'sent' | 'received' | 'error',
    sentAt: Date,
    receivedAt: Date,
    errorMessage: string
  },
  results: any (structured object),
  resultDate: Date,
  interpretation: string,
  referenceRanges: any,
  abnormalFlags: Record<string, 'high' | 'low' | 'normal'>,
  status: 'ordered' | 'in-progress' | 'completed' | 'reviewed' | 'cancelled',
  attachments: Array<Attachment>,
  reviewedBy: ObjectId,
  reviewedAt: Date,
  notificationSent: boolean,
  notificationSentAt: Date,
  notificationMethod: 'email' | 'sms' | 'both',
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints

### Lab Results
- `GET /api/lab-results` - List lab results (filters: patientId, visitId, status)
- `POST /api/lab-results` - Create new lab request
- `GET /api/lab-results/[id]` - Get lab result details
- `PUT /api/lab-results/[id]` - Update lab result
- `POST /api/lab-results/[id]/upload` - Upload result file
- `GET /api/lab-results/[id]/request-form` - Generate printable request form
- `POST /api/lab-results/[id]/notify` - Send notification to patient

### Third-Party Integration
- `POST /api/lab-results/third-party/send` - Send request to third-party lab
- `POST /api/lab-results/third-party/webhook` - Receive results from third-party lab

## Usage Examples

### Creating a Lab Request

```javascript
POST /api/lab-results
{
  "patient": "patient_id",
  "visit": "visit_id", // optional
  "request": {
    "testType": "Complete Blood Count (CBC)",
    "testCode": "CBC",
    "description": "Full blood count including hemoglobin, WBC, platelets",
    "urgency": "routine",
    "fastingRequired": false,
    "specialInstructions": "Patient should be well-hydrated"
  }
}
```

### Uploading Lab Results

```javascript
POST /api/lab-results/[id]/upload
FormData:
  - file: <file>
  - notes: "Lab results from external lab"
```

### Updating Results with Structured Data

```javascript
PUT /api/lab-results/[id]
{
  "results": {
    "hemoglobin": 13.2,
    "wbc": 6.5,
    "platelets": 250000
  },
  "referenceRanges": {
    "hemoglobin": "12-16 g/dL",
    "wbc": "4.5-11.0 x 10^3/μL",
    "platelets": "150-450 x 10^3/μL"
  },
  "abnormalFlags": {
    "hemoglobin": "normal",
    "wbc": "normal",
    "platelets": "normal"
  },
  "interpretation": "All values within normal range",
  "status": "completed"
}
```

### Sending Notification to Patient

```javascript
POST /api/lab-results/[id]/notify
{
  "method": "both" // or "email" or "sms"
}
```

### Sending Request to Third-Party Lab

```javascript
POST /api/lab-results/third-party/send
{
  "labResultId": "lab_result_id",
  "labConfig": {
    "labName": "ABC Laboratory",
    "labCode": "ABC-LAB",
    "integrationType": "api",
    "apiEndpoint": "https://api.abclab.com/requests",
    "apiKey": "your_api_key"
  }
}
```

## Third-Party Lab Integration Setup

### 1. Configure Lab Credentials

Store lab configuration in the LabResult's `thirdPartyLab` field or in environment variables:

```env
LAB_API_ENDPOINT=https://api.lab.com/requests
LAB_API_KEY=your_api_key
LAB_API_SECRET=your_api_secret
```

### 2. Send Request

Use the `/api/lab-results/third-party/send` endpoint to send requests to the lab.

### 3. Configure Webhook

Set up webhook URL in the lab's system:
```
https://your-domain.com/api/lab-results/third-party/webhook
```

The lab will POST results to this endpoint when available.

### 4. Webhook Security

In production, implement webhook signature verification:

```typescript
function verifyWebhookSignature(signature: string, payload: any): boolean {
  // Verify signature using lab's secret key
  // Implement based on lab's security requirements
  return true;
}
```

## Workflow

### Typical Lab Request Workflow:

1. **Create Request**: Provider creates lab request during visit
2. **Generate Form**: Print or send digital request form to lab
3. **Send to Lab**: 
   - Manual: Patient takes form to lab
   - API: Automatically send to third-party lab
4. **Lab Processing**: Lab processes the request
5. **Receive Results**:
   - Manual: Upload results via API
   - API: Receive via webhook
6. **Review Results**: Provider reviews and interprets results
7. **Notify Patient**: System sends notification to patient
8. **Archive**: Results stored in patient's medical record

## Status Flow

```
ordered → in-progress → completed → reviewed
   ↓
cancelled (at any stage)
```

- **ordered**: Request created, not yet sent to lab
- **in-progress**: Request sent to lab, awaiting results
- **completed**: Results received, not yet reviewed
- **reviewed**: Provider has reviewed and interpreted results
- **cancelled**: Request cancelled

## Future Enhancements

- Email templates for lab result notifications
- Patient portal for viewing results
- Automated result interpretation using AI
- Integration with more lab systems
- HL7 message processing
- Result comparison over time (trending)
- Critical value alerts
- Lab result templates for common tests
- QR code on request forms for easy scanning

