# API Reference

Complete REST API documentation for MyClinicSoft.

**Base URL**: `https://<subdomain>.myclinicsoft.com/api` (multi-tenant)  
**Authentication**: JWT Bearer token (except public routes)  
**Content-Type**: `application/json`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Patients](#patients)
3. [Appointments](#appointments)
4. [Visits](#visits)
5. [Prescriptions](#prescriptions)
6. [Lab Results](#lab-results)
7. [Queue Management](#queue-management)
8. [Invoices & Billing](#invoices--billing)
9. [Inventory](#inventory)
10. [Medical Representatives](#medical-representatives)
11. [Users & Roles](#users--roles)
12. [Notifications](#notifications)
13. [Settings](#settings)
14. [Error Codes](#error-codes)

---

## Authentication

### Login

```http
POST /api/auth/login
```

**Request Body**:
```json
{
  "email": "doctor@clinic.com",
  "password": "securePassword123"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "user": {
    "id": "64abc123...",
    "email": "doctor@clinic.com",
    "name": "Dr. Juan Cruz",
    "role": "doctor",
    "tenantId": "64xyz789..."
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors**:
- `401`: Invalid credentials
- `403`: Account suspended

---

### Get Current User

```http
GET /api/user/me
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "id": "64abc123...",
  "email": "doctor@clinic.com",
  "name": "Dr. Juan Cruz",
  "role": {
    "name": "doctor",
    "level": 80,
    "permissions": [...]
  },
  "tenantId": "64xyz789..."
}
```

---

### Logout

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Patients

### List Patients

```http
GET /api/patients
Authorization: Bearer <token>
```

**Query Parameters**:
- `page` (number): Page number (default: 1)
- `limit` (number): Per page (default: 20, max: 100)
- `search` (string): Search by name, email, phone, patientCode
- `status` (string): Filter by status (`active`, `inactive`, `deceased`)

**Response** (200 OK):
```json
{
  "patients": [
    {
      "id": "64p123...",
      "patientCode": "PAT-000001",
      "firstName": "Maria",
      "lastName": "Santos",
      "dateOfBirth": "1990-05-15",
      "sex": "female",
      "email": "maria@example.com",
      "phone": "+639123456789",
      "status": "active",
      "createdAt": "2024-01-15T08:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

**Access**: Doctor, Nurse, Receptionist  
**Rate Limit**: 100 requests/minute

---

### Create Patient

```http
POST /api/patients
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "firstName": "Maria",
  "lastName": "Santos",
  "dateOfBirth": "1990-05-15",
  "sex": "female",
  "email": "maria@example.com",
  "phone": "+639123456789",
  "address": {
    "street": "123 Rizal St",
    "city": "Manila",
    "state": "Metro Manila",
    "zipCode": "1000"
  },
  "emergencyContact": {
    "name": "Juan Santos",
    "phone": "+639987654321",
    "relationship": "spouse"
  }
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "patient": {
    "id": "64p123...",
    "patientCode": "PAT-000151",
    "firstName": "Maria",
    "lastName": "Santos",
    ...
  }
}
```

**Validation Rules**:
- `firstName`, `lastName`: Required, 1-100 chars
- `dateOfBirth`: Required, valid date, not future
- `sex`: Required, enum: `male`, `female`, `other`
- `email`: Valid email format (optional)
- `phone`: Required, valid phone format

**Errors**:
- `400`: Validation error
- `409`: Duplicate email/phone
- `403`: Insufficient permissions

---

### Get Patient Details

```http
GET /api/patients/:id
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "id": "64p123...",
  "patientCode": "PAT-000001",
  "firstName": "Maria",
  "lastName": "Santos",
  "dateOfBirth": "1990-05-15",
  "age": 34,
  "sex": "female",
  "email": "maria@example.com",
  "phone": "+639123456789",
  "address": { ... },
  "emergencyContact": { ... },
  "medicalHistory": "Hypertension since 2018",
  "preExistingConditions": [
    {
      "condition": "Hypertension",
      "diagnosisDate": "2018-03-20",
      "status": "active"
    }
  ],
  "allergies": [
    {
      "substance": "Penicillin",
      "reaction": "Rash",
      "severity": "moderate"
    }
  ],
  "immunizations": [...],
  "createdAt": "2024-01-15T08:00:00Z",
  "updatedAt": "2024-02-10T14:30:00Z"
}
```

**Errors**:
- `404`: Patient not found
- `403`: No access to this patient

---

### Update Patient

```http
PUT /api/patients/:id
Authorization: Bearer <token>
```

**Request Body**: Partial patient object (only fields to update)

```json
{
  "phone": "+639191234567",
  "allergies": [
    {
      "substance": "Penicillin",
      "reaction": "Rash",
      "severity": "moderate"
    }
  ]
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "patient": { ... }
}
```

---

### Delete Patient

```http
DELETE /api/patients/:id
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Patient marked as inactive"
}
```

**Note**: Soft delete (sets `status: 'inactive'`), does not remove data.

---

## Appointments

### List Appointments

```http
GET /api/appointments
Authorization: Bearer <token>
```

**Query Parameters**:
- `date` (string): Filter by date (YYYY-MM-DD)
- `doctor` (string): Filter by doctor ID
- `patient` (string): Filter by patient ID
- `status` (string): Filter by status

**Response** (200 OK):
```json
{
  "appointments": [
    {
      "id": "64a123...",
      "appointmentCode": "APT-000123",
      "patient": {
        "id": "64p123...",
        "name": "Maria Santos",
        "patientCode": "PAT-000001"
      },
      "doctor": {
        "id": "64d123...",
        "name": "Dr. Juan Cruz"
      },
      "appointmentDate": "2024-02-15",
      "appointmentTime": "09:30",
      "duration": 30,
      "appointmentType": "consultation",
      "status": "scheduled",
      "reason": "Annual checkup"
    }
  ]
}
```

---

### Create Appointment

```http
POST /api/appointments
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "patient": "64p123...",
  "doctor": "64d123...",
  "appointmentDate": "2024-02-15",
  "appointmentTime": "09:30",
  "duration": 30,
  "appointmentType": "consultation",
  "reason": "Annual checkup"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "appointment": { ... }
}
```

**Validation**:
- Check doctor availability (no overlapping appointments)
- Appointment date must be future
- Duration: 15, 30, 45, or 60 minutes

**Errors**:
- `409`: Time slot not available
- `400`: Invalid time slot

---

### Update Appointment Status

```http
PATCH /api/appointments/:id
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "status": "confirmed"
}
```

**Valid Status Transitions**:
- `scheduled` → `confirmed`, `cancelled`, `no-show`
- `confirmed` → `in-progress`, `cancelled`, `no-show`
- `in-progress` → `completed`, `cancelled`

**Response** (200 OK):
```json
{
  "success": true,
  "appointment": { ... }
}
```

---

### Cancel Appointment

```http
DELETE /api/appointments/:id
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "cancelReason": "Patient requested rescheduling"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Appointment cancelled"
}
```

---

## Visits

### List Visits

```http
GET /api/visits
Authorization: Bearer <token>
```

**Query Parameters**:
- `patient` (string): Patient ID
- `doctor` (string): Doctor ID
- `startDate`, `endDate`: Date range
- `status`: `in-progress`, `completed`, `cancelled`

**Response** (200 OK):
```json
{
  "visits": [
    {
      "id": "64v123...",
      "visitCode": "VIS-000456",
      "patient": { ... },
      "doctor": { ... },
      "date": "2024-02-14T10:30:00Z",
      "visitType": "consultation",
      "chiefComplaint": "Fever and cough",
      "status": "completed",
      "completedAt": "2024-02-14T11:00:00Z"
    }
  ]
}
```

---

### Create Visit

```http
POST /api/visits
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "patient": "64p123...",
  "visitType": "consultation",
  "chiefComplaint": "Fever and cough for 3 days",
  "vitals": {
    "bp": "120/80",
    "hr": 78,
    "rr": 16,
    "tempC": 38.5,
    "spo2": 98,
    "weightKg": 65
  }
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "visit": { ... }
}
```

---

### Update Visit (SOAP Notes)

```http
PUT /api/visits/:id
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "soapNotes": {
    "subjective": "Patient reports fever (38.5°C) and dry cough for 3 days. No difficulty breathing. No known COVID exposure.",
    "objective": "Vital signs stable. BP 120/80, HR 78, RR 16, Temp 38.5°C, SpO2 98%. Chest clear on auscultation. Throat mildly erythematous.",
    "assessment": "Acute upper respiratory tract infection (URI)",
    "plan": "Paracetamol 500mg TID PRN fever, Increase fluid intake, Rest. Follow-up if symptoms worsen or persist >5 days."
  },
  "physicalExam": {
    "general": "Alert, not in distress",
    "heent": "Throat mildly erythematous",
    "chest": "Clear breath sounds bilaterally"
  },
  "diagnoses": [
    {
      "icd10Code": "J06.9",
      "description": "Acute upper respiratory infection",
      "type": "primary"
    }
  ],
  "treatmentPlan": {
    "medications": [
      {
        "name": "Paracetamol",
        "dosage": "500mg",
        "frequency": "3x a day",
        "duration": "5 days",
        "instructions": "Take as needed for fever"
      }
    ],
    "followUp": {
      "date": "2024-02-21",
      "instructions": "Return if symptoms worsen or persist"
    }
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "visit": { ... }
}
```

---

### Complete Visit (E-Signature)

```http
POST /api/visits/:id/complete
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "signatureData": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "visit": {
    ...
    "status": "completed",
    "digitalSignature": {
      "providerName": "Dr. Juan Cruz",
      "signedAt": "2024-02-14T11:00:00Z"
    }
  }
}
```

---

## Prescriptions

### Create Prescription

```http
POST /api/prescriptions
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "patient": "64p123...",
  "visit": "64v123...",
  "medications": [
    {
      "name": "Amoxicillin",
      "genericName": "Amoxicillin",
      "dosage": "500mg",
      "form": "capsule",
      "frequency": "3x a day",
      "duration": "7 days",
      "quantity": 21,
      "instructions": "Take after meals",
      "refills": 0
    }
  ],
  "diagnosis": "Acute bacterial pharyngitis"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "prescription": {
    "id": "64pr123...",
    "prescriptionCode": "RX-000789",
    ...
    "status": "active",
    "expiryDate": "2024-05-14"
  }
}
```

---

### Check Drug Interactions

```http
POST /api/prescriptions/check-interactions
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "medications": ["Warfarin", "Aspirin", "Amoxicillin"]
}
```

**Response** (200 OK):
```json
{
  "interactions": [
    {
      "drugs": ["Warfarin", "Aspirin"],
      "severity": "major",
      "description": "Increased risk of bleeding",
      "recommendation": "Monitor INR closely, consider alternative"
    }
  ],
  "safe": false
}
```

---

### Print Prescription

```http
GET /api/prescriptions/:id/print
Authorization: Bearer <token>
```

**Response**: PDF file with prescription details, doctor's digital signature, and QR code for verification.

---

## Lab Results

### Create Lab Order

```http
POST /api/lab-results
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "patient": "64p123...",
  "visit": "64v123...",
  "testName": "Complete Blood Count (CBC)",
  "testType": "blood",
  "specimenType": "venous blood",
  "orderDate": "2024-02-14"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "labResult": {
    "id": "64l123...",
    "resultCode": "LAB-000234",
    "status": "ordered"
  }
}
```

---

### Update Lab Results

```http
PUT /api/lab-results/:id
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "status": "completed",
  "resultDate": "2024-02-15T14:30:00Z",
  "results": [
    {
      "parameter": "Hemoglobin",
      "value": "14.5",
      "unit": "g/dL",
      "referenceRange": "12-16",
      "flag": "normal"
    },
    {
      "parameter": "WBC",
      "value": "12.5",
      "unit": "x10^9/L",
      "referenceRange": "4-11",
      "flag": "high"
    }
  ],
  "interpretation": "Elevated WBC suggests possible infection",
  "criticalValue": false
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "labResult": { ... },
  "notificationSent": true
}
```

**Automatic Actions**:
- Email notification to patient if `patientNotified` enabled
- SMS alert if `criticalValue: true`
- Update patient's medical record

---

## Queue Management

### Check In Patient

```http
POST /api/queue/check-in
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "patient": "64p123...",
  "appointment": "64a123...",
  "checkInMethod": "appointment",
  "vitals": {
    "bp": "120/80",
    "hr": 75,
    "tempC": 36.8
  }
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "queue": {
    "id": "64q123...",
    "queueNumber": 5,
    "status": "waiting",
    "estimatedWaitTime": 25,
    "qrCode": "https://api.qrserver.com/v1/create-qr-code/?data=64q123..."
  }
}
```

---

### Get Active Queue

```http
GET /api/queue
Authorization: Bearer <token>
```

**Query Parameters**:
- `status`: `waiting`, `in-progress`, `completed`
- `doctor`: Filter by doctor ID

**Response** (200 OK):
```json
{
  "queue": [
    {
      "id": "64q123...",
      "queueNumber": 5,
      "patient": {
        "name": "Maria Santos",
        "age": 34
      },
      "doctor": {
        "name": "Dr. Juan Cruz"
      },
      "status": "waiting",
      "queuedAt": "2024-02-14T09:15:00Z",
      "waitTime": 18
    }
  ],
  "stats": {
    "waiting": 5,
    "inProgress": 2,
    "completed": 23,
    "averageWaitTime": 22
  }
}
```

---

### Call Next Patient

```http
POST /api/queue/:id/call
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "queue": {
    "status": "in-progress",
    "calledAt": "2024-02-14T09:30:00Z"
  }
}
```

**Automatic Actions**:
- Display update on queue monitor screen
- SMS notification to patient
- WebSocket broadcast to all clients

---

## Invoices & Billing

### Create Invoice

```http
POST /api/invoices
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "patient": "64p123...",
  "visit": "64v123...",
  "items": [
    {
      "description": "Consultation Fee",
      "quantity": 1,
      "unitPrice": 500,
      "amount": 500,
      "category": "consultation"
    },
    {
      "description": "CBC Test",
      "quantity": 1,
      "unitPrice": 350,
      "amount": 350,
      "category": "laboratory"
    }
  ],
  "discount": 50,
  "discountReason": "Senior citizen discount"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "invoice": {
    "id": "64i123...",
    "invoiceNumber": "INV-000567",
    "subtotal": 850,
    "discount": 50,
    "tax": 0,
    "total": 800,
    "paymentStatus": "unpaid",
    "balance": 800,
    "dueDate": "2024-02-21"
  }
}
```

---

### Record Payment

```http
POST /api/invoices/:id/payment
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "amount": 800,
  "method": "cash",
  "reference": "OR-123456"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "invoice": {
    ...
    "paymentStatus": "paid",
    "amountPaid": 800,
    "balance": 0,
    "payments": [
      {
        "date": "2024-02-14T11:00:00Z",
        "amount": 800,
        "method": "cash",
        "reference": "OR-123456"
      }
    ]
  }
}
```

**Payment Methods**:
- `cash`: Cash payment
- `card`: Credit/debit card
- `gcash`: GCash
- `bank-transfer`: Bank transfer
- `insurance`: Insurance claim

---

### Get Outstanding Invoices

```http
GET /api/invoices/outstanding
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "invoices": [...],
  "summary": {
    "total": 25,
    "totalAmount": 45000,
    "overdue": 5,
    "overdueAmount": 12000
  }
}
```

---

## Inventory

### List Inventory

```http
GET /api/inventory
Authorization: Bearer <token>
```

**Query Parameters**:
- `category`: `medicine`, `supply`, `equipment`
- `status`: `in-stock`, `low-stock`, `out-of-stock`, `expired`

**Response** (200 OK):
```json
{
  "items": [
    {
      "id": "64inv123...",
      "itemCode": "MED-0001",
      "itemName": "Paracetamol 500mg",
      "category": "medicine",
      "quantity": 500,
      "unit": "tablets",
      "reorderLevel": 100,
      "status": "in-stock",
      "expiryDate": "2025-12-31"
    }
  ]
}
```

---

### Restock Item

```http
POST /api/inventory/:id/restock
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "quantity": 1000,
  "costPrice": 2.50,
  "supplier": "PharmaCorp",
  "expiryDate": "2025-12-31"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "inventory": {
    ...
    "quantity": 1500,
    "lastRestockDate": "2024-02-14"
  }
}
```

---

### Adjust Inventory

```http
POST /api/inventory/:id/adjust
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "type": "adjustment",
  "quantity": -10,
  "reason": "Expired stock removed"
}
```

**Transaction Types**:
- `restock`: Add stock
- `dispense`: Remove stock (patient purchase)
- `adjustment`: Manual adjustment
- `return`: Return from patient

---

## Medical Representatives

### MedRep Login

```http
POST /api/medical-representatives/login
Content-Type: application/json
```

**Request Body**:
```json
{
  "email": "rep@pharma.com",
  "password": "securePass123"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "representative": {
    "id": "64mr123...",
    "name": "John Doe",
    "company": "PharmaCorp",
    "approvalStatus": "approved"
  },
  "token": "eyJhbGci..."
}
```

---

### Register Visit

```http
POST /api/medical-representatives/visits
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "tenantId": "64t123...",
  "visitDate": "2024-02-14T14:00:00Z",
  "purpose": "Product presentation",
  "productsPresented": ["Amoxicillin 500mg", "Paracetamol 500mg"],
  "notes": "Discussed new product line and pricing"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "visit": {
    "id": "64mrv123...",
    "status": "completed"
  }
}
```

---

## Users & Roles

### List Users

```http
GET /api/users
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "users": [
    {
      "id": "64u123...",
      "email": "doctor@clinic.com",
      "name": "Dr. Juan Cruz",
      "role": "doctor",
      "status": "active"
    }
  ]
}
```

**Access**: Admin only

---

### Create User

```http
POST /api/users
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "email": "nurse@clinic.com",
  "password": "tempPassword123",
  "name": "Maria Santos",
  "role": "nurse"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "user": {
    "id": "64u124...",
    "email": "nurse@clinic.com",
    "name": "Maria Santos",
    "role": "nurse"
  }
}
```

**Access**: Admin only

---

### Update User Role

```http
PUT /api/users/:id/role
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "role": "senior-nurse"
}
```

**Access**: Admin only

---

## Notifications

### Get Notifications

```http
GET /api/notifications
Authorization: Bearer <token>
```

**Query Parameters**:
- `unread` (boolean): Filter unread only
- `type`: Filter by type

**Response** (200 OK):
```json
{
  "notifications": [
    {
      "id": "64n123...",
      "type": "lab-result",
      "title": "Lab Result Available",
      "message": "CBC results for Maria Santos are ready",
      "data": {
        "labResultId": "64l123...",
        "patientId": "64p123..."
      },
      "read": false,
      "createdAt": "2024-02-14T15:30:00Z"
    }
  ],
  "unreadCount": 5
}
```

---

### Mark as Read

```http
PATCH /api/notifications/:id
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "read": true
}
```

---

### Mark All as Read

```http
POST /api/notifications/mark-all-read
Authorization: Bearer <token>
```

---

## Settings

### Get Settings

```http
GET /api/settings
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "clinic": {
    "name": "MyClinic",
    "email": "info@myclinic.com",
    "phone": "+639123456789",
    "address": "123 Health St, Manila"
  },
  "appointments": {
    "defaultDuration": 30,
    "allowOnlineBooking": true,
    "reminderHours": 24
  },
  "billing": {
    "currency": "PHP",
    "taxRate": 0,
    "paymentMethods": ["cash", "card", "gcash"]
  }
}
```

---

### Update Settings

```http
PUT /api/settings
Authorization: Bearer <token>
```

**Request Body**: Partial settings object

**Access**: Admin only

---

## Error Codes

### Standard HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created successfully |
| 204 | No Content | Successful deletion |
| 400 | Bad Request | Invalid request body or parameters |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Duplicate resource or validation conflict |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Maintenance mode |

### Error Response Format

```json
{
  "error": true,
  "message": "Validation failed",
  "details": {
    "field": "email",
    "code": "INVALID_EMAIL",
    "message": "Invalid email format"
  },
  "timestamp": "2024-02-14T16:00:00Z"
}
```

### Custom Error Codes

| Code | Description |
|------|-------------|
| `INVALID_CREDENTIALS` | Wrong email/password |
| `TOKEN_EXPIRED` | JWT token expired |
| `INSUFFICIENT_PERMISSIONS` | User lacks required permission |
| `DUPLICATE_RECORD` | Resource already exists |
| `INVALID_TENANT` | Tenant not found or inactive |
| `APPOINTMENT_CONFLICT` | Time slot already booked |
| `PRESCRIPTION_EXPIRED` | Cannot dispense expired prescription |
| `LAB_RESULT_NOT_READY` | Lab result still processing |
| `PAYMENT_FAILED` | Payment processing error |
| `INVENTORY_INSUFFICIENT` | Not enough stock |

---

## Rate Limiting

All API endpoints are rate-limited:

- **Authentication**: 5 requests/15min per IP
- **General API**: 100 requests/min per user
- **Public endpoints**: 20 requests/min per IP
- **File uploads**: 10 requests/hr per user

**Rate Limit Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1707924000
```

**Rate Limit Exceeded Response** (429):
```json
{
  "error": true,
  "message": "Rate limit exceeded",
  "retryAfter": 45
}
```

---

## Pagination

All list endpoints support pagination:

**Request**:
```http
GET /api/patients?page=2&limit=20
```

**Response**:
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 150,
    "pages": 8,
    "hasNext": true,
    "hasPrev": true
  }
}
```

**Default**: `page=1`, `limit=20`  
**Maximum**: `limit=100`

---

## Webhooks

MyClinicSoft supports webhooks for real-time events:

### Available Events

- `patient.created`
- `patient.updated`
- `appointment.created`
- `appointment.cancelled`
- `visit.completed`
- `lab-result.completed`
- `invoice.paid`
- `prescription.created`

### Webhook Payload

```json
{
  "event": "lab-result.completed",
  "timestamp": "2024-02-14T15:30:00Z",
  "tenantId": "64t123...",
  "data": {
    "labResultId": "64l123...",
    "patientId": "64p123...",
    "testName": "CBC",
    "criticalValue": false
  }
}
```

**Configuration**: Admin → Settings → Webhooks

---

## Best Practices

1. **Authentication**: Always include JWT token in `Authorization` header
2. **Error Handling**: Check for error responses and handle gracefully
3. **Pagination**: Use pagination for large datasets
4. **Rate Limits**: Implement exponential backoff for 429 responses
5. **Validation**: Validate input client-side before API calls
6. **Idempotency**: Use unique request IDs for critical operations
7. **Versioning**: API version is currently v1 (no prefix needed)
8. **HTTPS**: Always use HTTPS in production
9. **Caching**: Implement caching for frequently accessed data
10. **WebSockets**: Use WebSockets for real-time queue updates

---

**Last Updated**: February 14, 2026  
**API Version**: 1.0.0  
**Base URL**: `https://<subdomain>.myclinicsoft.com/api`

