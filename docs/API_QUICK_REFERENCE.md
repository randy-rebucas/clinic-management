# MyClinicSoft - API Quick Reference

**Version:** 1.0  
**Quick reference for all API endpoints**

---

## Authentication

All API endpoints (except public endpoints) require authentication via session cookies.

### Public Endpoints
- `/api/appointments/public` - Public appointment availability
- `/api/tenants/public` - Public tenant information
- `/api/health` - Health check

---

## API Endpoints by Category

### Patients

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/patients` | List all patients |
| POST | `/api/patients` | Create new patient |
| GET | `/api/patients/[id]` | Get patient details |
| PUT | `/api/patients/[id]` | Update patient |
| DELETE | `/api/patients/[id]` | Delete patient |
| POST | `/api/patients/[id]/upload` | Upload patient files |
| GET | `/api/patients/[id]/outstanding-balance` | Get outstanding balance |
| GET | `/api/patients/[id]/alerts` | Get patient alerts |
| GET | `/api/patients/qr-login` | QR code login |
| GET | `/api/patients/appointments` | Get patient appointments |
| GET | `/api/patients/appointments/[id]` | Get patient appointment |

**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `search` - Search term
- `status` - Filter by status

---

### Appointments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/appointments` | List appointments |
| POST | `/api/appointments` | Create appointment |
| GET | `/api/appointments/[id]` | Get appointment details |
| PUT | `/api/appointments/[id]` | Update appointment |
| DELETE | `/api/appointments/[id]` | Delete appointment |
| GET | `/api/appointments/public` | Public availability |
| POST | `/api/appointments/[id]/confirm` | Confirm appointment |
| POST | `/api/appointments/reminders/sms` | Send SMS reminders |

**Query Parameters:**
- `date` - Filter by date
- `doctorId` - Filter by doctor
- `patientId` - Filter by patient
- `status` - Filter by status

---

### Visits

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/visits` | List visits |
| POST | `/api/visits` | Create visit |
| GET | `/api/visits/[id]` | Get visit details |
| PUT | `/api/visits/[id]` | Update visit |
| POST | `/api/visits/[id]/upload` | Upload visit documents |
| GET | `/api/visits/[id]/print/medical-certificate` | Print medical certificate |
| GET | `/api/visits/[id]/print/lab-request` | Print lab request form |
| POST | `/api/visits/[id]/close` | Close visit |

**Query Parameters:**
- `date` - Filter by date
- `patientId` - Filter by patient
- `provider` - Filter by provider
- `status` - Filter by status

---

### Prescriptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prescriptions` | List prescriptions |
| POST | `/api/prescriptions` | Create prescription |
| GET | `/api/prescriptions/[id]` | Get prescription details |
| PUT | `/api/prescriptions/[id]` | Update prescription |
| POST | `/api/prescriptions/[id]/dispense` | Mark as dispensed |
| GET | `/api/prescriptions/[id]/print` | Print prescription |
| POST | `/api/prescriptions/check-interactions` | Check drug interactions |

**Request Body (Create):**
```json
{
  "patient": "patientId",
  "visit": "visitId",
  "provider": "userId",
  "medications": [
    {
      "medicine": "medicineId",
      "name": "Medicine Name",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "duration": "7 days",
      "instructions": "Take with food"
    }
  ]
}
```

---

### Lab Results

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/lab-results` | List lab results |
| POST | `/api/lab-results` | Create lab result |
| GET | `/api/lab-results/[id]` | Get lab result details |
| PUT | `/api/lab-results/[id]` | Update lab result |
| DELETE | `/api/lab-results/[id]` | Delete lab result |
| POST | `/api/lab-results/[id]/upload` | Upload lab results |
| POST | `/api/lab-results/[id]/notify` | Notify patient |
| GET | `/api/lab-results/[id]/request-form` | Get request form |
| POST | `/api/lab-results/third-party/send` | Send to third party |
| POST | `/api/lab-results/third-party/webhook` | Third party webhook |

---

### Invoices

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoices` | List invoices |
| POST | `/api/invoices` | Create invoice |
| GET | `/api/invoices/[id]` | Get invoice details |
| PUT | `/api/invoices/[id]` | Update invoice |
| DELETE | `/api/invoices/[id]` | Delete invoice |
| POST | `/api/invoices/[id]/payment` | Record payment |
| GET | `/api/invoices/[id]/receipt` | Get receipt |
| GET | `/api/invoices/outstanding` | Get outstanding invoices |

**Request Body (Payment):**
```json
{
  "amount": 1000,
  "method": "cash",
  "reference": "optional-reference"
}
```

---

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List documents |
| POST | `/api/documents` | Upload document |
| GET | `/api/documents/[id]` | Get document details |
| PUT | `/api/documents/[id]` | Update document |
| DELETE | `/api/documents/[id]` | Delete document |
| GET | `/api/documents/[id]/download` | Download document |
| GET | `/api/documents/[id]/view` | View document |
| POST | `/api/documents/scan` | Scan document (OCR) |

---

### Queue

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/queue` | Get queue entries |
| POST | `/api/queue` | Add to queue |
| GET | `/api/queue/[id]` | Get queue entry |
| PUT | `/api/queue/[id]` | Update queue entry |
| DELETE | `/api/queue/[id]` | Remove from queue |
| GET | `/api/queue/[id]/qr-code` | Get QR code |
| POST | `/api/queue/check-in` | Check in patient |
| GET | `/api/queue/display` | Get display data (for TV screens) |
| POST | `/api/queue/optimize` | Optimize queue |

---

### Doctors

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/doctors` | List all doctors |
| POST | `/api/doctors` | Create doctor |
| GET | `/api/doctors/[id]` | Get doctor details |
| PUT | `/api/doctors/[id]` | Update doctor |
| GET | `/api/doctors/[id]/schedule` | Get doctor schedule |
| GET | `/api/doctors/[id]/productivity` | Get doctor productivity |
| GET | `/api/doctors/productivity` | Get all doctors productivity |

---

### Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory` | List inventory items |
| POST | `/api/inventory` | Create inventory item |
| GET | `/api/inventory/[id]` | Get inventory item |
| PUT | `/api/inventory/[id]` | Update inventory item |
| DELETE | `/api/inventory/[id]` | Delete inventory item |

---

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/dashboard` | Dashboard statistics |
| GET | `/api/reports/dashboard/role-based` | Role-based dashboard |
| GET | `/api/reports/consultations` | Consultation reports |
| GET | `/api/reports/demographics` | Demographics reports |
| GET | `/api/reports/income` | Income reports |
| GET | `/api/reports/inventory` | Inventory reports |
| GET | `/api/reports/hmo-claims` | HMO claims reports |

**Query Parameters:**
- `startDate` - Start date
- `endDate` - End date
- `format` - Response format (json, csv, pdf)

---

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get notifications |
| GET | `/api/notifications/unread-count` | Get unread count |
| POST | `/api/notifications/mark-all-read` | Mark all as read |
| PUT | `/api/notifications/[id]` | Update notification |

**Query Parameters:**
- `read` - Filter by read status
- `type` - Filter by type
- `priority` - Filter by priority

---

### Audit Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audit-logs` | Get audit logs |
| GET | `/api/audit-logs/patient-access` | Get patient access logs |

**Query Parameters:**
- `userId` - Filter by user
- `resource` - Filter by resource
- `resourceId` - Filter by resource ID
- `action` - Filter by action
- `dataSubject` - Filter by patient (PH DPA)
- `startDate` - Start date
- `endDate` - End date
- `isSensitive` - Filter sensitive logs

---

### Subscription

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/subscription/status` | Get subscription status |
| GET | `/api/subscription/usage` | Get usage statistics |
| GET | `/api/subscription/dashboard` | Get subscription dashboard |
| POST | `/api/subscription/create-order` | Create PayPal order |
| POST | `/api/subscription/capture-order` | Capture PayPal payment |
| POST | `/api/subscription/webhook` | PayPal webhook |

---

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Update settings |

---

### Cron Jobs

All cron endpoints require `CRON_SECRET` in headers:

| Method | Endpoint | Description | Schedule |
|--------|----------|-------------|----------|
| GET | `/api/cron/backup` | Database backup | Daily |
| GET | `/api/cron/payment-reminders` | Payment reminders | Daily 10 AM |
| GET | `/api/cron/inventory-alerts` | Inventory alerts | Daily 8 AM |
| GET | `/api/cron/expiry-monitoring` | Expiry monitoring | Daily 7 AM |
| GET | `/api/cron/daily-reports` | Daily reports | Daily 9 PM |
| GET | `/api/cron/weekly-reports` | Weekly reports | Weekly |
| GET | `/api/cron/monthly-reports` | Monthly reports | Monthly |
| GET | `/api/cron/prescription-refills` | Prescription refills | Daily |
| GET | `/api/cron/trial-expiration` | Trial expiration | Daily |
| GET | `/api/cron/usage-alerts` | Usage alerts | Daily |

---

## Common Response Formats

### Success Response

```json
{
  "success": true,
  "data": {
    // Response data
  }
}
```

### Error Response

```json
{
  "error": "Error message",
  "details": {
    // Additional error details
  }
}
```

### Pagination Response

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

---

## Common Query Parameters

### Pagination
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

### Filtering
- `status` - Filter by status
- `date` - Filter by date
- `startDate` - Start date range
- `endDate` - End date range
- `doctorId` - Filter by doctor
- `patientId` - Filter by patient
- `search` - Search term

### Sorting
- `sortBy` - Field to sort by
- `sortOrder` - `asc` or `desc` (default: `desc`)

---

## Request/Response Examples

### Create Patient

**Request:**
```http
POST /api/patients
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-01-01",
  "email": "john.doe@example.com",
  "phone": "+1234567890",
  "address": {
    "street": "123 Main St",
    "city": "City",
    "state": "State",
    "zipCode": "12345"
  },
  "emergencyContact": {
    "name": "Jane Doe",
    "phone": "+1234567891",
    "relationship": "Spouse"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "patientId",
    "patientCode": "CLINIC-0001",
    "firstName": "John",
    "lastName": "Doe",
    // ... other fields
  }
}
```

### Create Appointment

**Request:**
```http
POST /api/appointments
Content-Type: application/json

{
  "patient": "patientId",
  "doctor": "doctorId",
  "date": "2024-01-15",
  "time": "10:00",
  "duration": 30,
  "reason": "Regular checkup"
}
```

### Record Payment

**Request:**
```http
POST /api/invoices/invoiceId/payment
Content-Type: application/json

{
  "amount": 1000,
  "method": "cash",
  "reference": "REF-12345"
}
```

---

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 422 | Validation Error |
| 500 | Internal Server Error |

---

## Rate Limiting

API endpoints may have rate limiting. Check response headers:
- `X-RateLimit-Limit` - Request limit
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset time

---

## Webhooks

### PayPal Webhook

**Endpoint:** `/api/subscription/webhook`

**Headers:**
- `PayPal-Transmission-Id`
- `PayPal-Transmission-Time`
- `PayPal-Transmission-Sig`

### Third-Party Lab Webhook

**Endpoint:** `/api/lab-results/third-party/webhook`

**Request Body:**
```json
{
  "labId": "lab-id",
  "patientId": "patient-id",
  "testName": "Test Name",
  "results": [...],
  "status": "completed"
}
```

---

**For detailed API documentation, see individual endpoint files in `app/api/` directory.**

