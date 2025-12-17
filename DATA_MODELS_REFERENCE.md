# MyClinicSoft - Data Models Reference

**Version:** 1.0  
**Complete reference for all data models and their relationships**

---

## Table of Contents

1. [Model Overview](#model-overview)
2. [Core Models](#core-models)
3. [Clinical Models](#clinical-models)
4. [Administrative Models](#administrative-models)
5. [Supporting Models](#supporting-models)
6. [Model Relationships](#model-relationships)
7. [Tenant Scoping](#tenant-scoping)

---

## Model Overview

MyClinicSoft uses MongoDB with Mongoose for data modeling. All models support multi-tenancy through `tenantId` field.

### Model Categories

1. **Base/Reference Models** - No dependencies
2. **Auth Models** - Authentication and authorization
3. **Profile Models** - Staff profiles
4. **User Model** - User accounts
5. **Clinical Models** - Patient care
6. **Transactional Models** - Appointments, visits, etc.
7. **Supporting Models** - Queue, documents, etc.
8. **Audit Models** - Audit logs and notifications

---

## Core Models

### Patient

**Purpose:** Core patient record with demographics and medical history

**Key Fields:**
```typescript
{
  tenantId: ObjectId,           // Multi-tenant support
  patientCode: string,          // Unique patient code
  firstName: string,
  middleName?: string,
  lastName: string,
  dateOfBirth: Date,
  sex: 'male' | 'female' | 'other' | 'unknown',
  email: string,
  phone: string,
  address: {
    street: string,
    city: string,
    state: string,
    zipCode: string
  },
  emergencyContact: {
    name: string,
    phone: string,
    relationship?: string
  },
  medicalHistory?: string,
  preExistingConditions?: Array<{
    condition: string,
    diagnosisDate?: Date,
    status: 'active' | 'resolved' | 'chronic'
  }>,
  allergies?: Array<string | {
    substance: string,
    reaction: string,
    severity: string
  }>,
  discountEligibility?: {
    pwd?: { eligible: boolean, idNumber?: string },
    senior?: { eligible: boolean, idNumber?: string },
    membership?: { eligible: boolean, membershipType?: string }
  },
  attachments?: IAttachment[],
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- One-to-Many: Appointments, Visits, Prescriptions, LabResults, Invoices, Documents
- One-to-One: Membership

---

### User

**Purpose:** User accounts with role-based access control

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,          // Multi-tenant support
  name: string,
  email: string,
  password: string,             // Hashed with bcrypt
  role: ObjectId,               // Reference to Role
  permissions?: ObjectId[],     // Custom permissions
  // Profile references (one-to-one)
  adminProfile?: ObjectId,
  doctorProfile?: ObjectId,
  nurseProfile?: ObjectId,
  receptionistProfile?: ObjectId,
  accountantProfile?: ObjectId,
  medicalRepresentativeProfile?: ObjectId,
  status: 'active' | 'inactive' | 'suspended',
  lastLogin?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-One: Role
- One-to-Many: Permissions
- One-to-One: Admin, Doctor, Nurse, Receptionist, Accountant, MedicalRepresentative
- One-to-Many: Appointments, Visits, Prescriptions, LabResults, Invoices, AuditLogs

---

### Role

**Purpose:** User roles with default permissions

**Key Fields:**
```typescript
{
  name: string,                 // 'admin', 'doctor', 'nurse', etc.
  displayName: string,
  description?: string,
  permissions: ObjectId[],       // Default permissions
  isSystemRole: boolean,        // Cannot be deleted
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- One-to-Many: Users
- Many-to-Many: Permissions

---

### Permission

**Purpose:** Granular permissions for resources and actions

**Key Fields:**
```typescript
{
  resource: string,              // 'patients', 'visits', etc.
  action: string,                // 'read', 'write', 'update', 'delete'
  description?: string,
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-Many: Roles
- Many-to-Many: Users

---

## Clinical Models

### Appointment

**Purpose:** Appointment scheduling and management

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  patient: ObjectId,            // Reference to Patient
  doctor?: ObjectId,              // Reference to Doctor
  service?: ObjectId,             // Reference to Service
  date: Date,
  time: string,                   // Time slot
  duration: number,                // Minutes
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show',
  reason?: string,
  notes?: string,
  reminderSent?: boolean,
  confirmedAt?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-One: Patient, Doctor, Service
- One-to-One: Queue (optional)
- One-to-One: Visit (optional)

---

### Visit

**Purpose:** Clinical visit documentation with SOAP notes

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  patient: ObjectId,             // Reference to Patient
  visitCode: string,              // Unique visit code
  date: Date,
  provider?: ObjectId,            // Reference to User (Doctor)
  visitType: 'consultation' | 'follow-up' | 'checkup' | 'emergency' | 'teleconsult',
  chiefComplaint?: string,
  historyOfPresentIllness?: string,
  vitals?: {
    bp?: string,                  // "120/80"
    hr?: number,                  // Heart rate
    rr?: number,                  // Respiratory rate
    tempC?: number,              // Temperature Celsius
    spo2?: number,               // Oxygen saturation
    heightCm?: number,
    weightKg?: number,
    bmi?: number
  },
  physicalExam?: {
    general?: string,
    heent?: string,
    chest?: string,
    cardiovascular?: string,
    abdomen?: string,
    neuro?: string,
    skin?: string
  },
  diagnoses: Array<{
    code?: string,                // ICD-10 code
    description?: string,
    primary?: boolean
  }>,
  soapNotes?: {
    subjective?: string,
    objective?: string,
    assessment?: string,
    plan?: string
  },
  treatmentPlan?: {
    medications?: Array<{...}>,
    procedures?: Array<{...}>,
    lifestyle?: Array<{...}>,
    followUp?: {...}
  },
  digitalSignature?: {
    providerName: string,
    providerId: ObjectId,
    signatureData: string,        // Base64 encoded
    signedAt: Date
  },
  status: 'open' | 'in-progress' | 'closed' | 'cancelled',
  attachments?: IAttachment[],
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-One: Patient, User (Provider)
- One-to-Many: Prescriptions, LabResults, Imaging, Procedures
- One-to-One: Invoice (when closed)
- One-to-One: Appointment (optional)

---

### Prescription

**Purpose:** Electronic prescriptions with drug interaction checking

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  patient: ObjectId,              // Reference to Patient
  visit?: ObjectId,               // Reference to Visit
  provider: ObjectId,             // Reference to User (Doctor)
  medications: Array<{
    medicine: ObjectId,           // Reference to Medicine
    name: string,
    dosage: string,
    frequency: string,
    duration: string,
    instructions?: string,
    quantity?: number,
    refills?: number,
    refillsRemaining?: number
  }>,
  status: 'active' | 'completed' | 'cancelled' | 'refilled',
  interactions?: Array<{
    medications: string[],
    severity: 'mild' | 'moderate' | 'severe',
    description: string
  }>,
  pharmacyDispense?: {
    pharmacyName?: string,
    dispensedAt?: Date,
    dispensedBy?: string
  },
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-One: Patient, Visit, User (Provider)
- Many-to-Many: Medicine

---

### LabResult

**Purpose:** Laboratory test results with third-party integration

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  patient: ObjectId,               // Reference to Patient
  visit?: ObjectId,                // Reference to Visit
  provider: ObjectId,              // Reference to User
  testName: string,
  testType: string,
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled',
  results?: Array<{
    test: string,
    value: string | number,
    unit?: string,
    normalRange?: string,
    flag?: 'normal' | 'high' | 'low' | 'critical'
  }>,
  notes?: string,
  labRequest?: {
    requestedBy: ObjectId,
    requestedAt: Date,
    tests: string[]
  },
  thirdPartyLab?: {
    labName: string,
    labId: string,
    receivedAt?: Date,
    sentAt?: Date
  },
  attachments?: IAttachment[],
  notifiedAt?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-One: Patient, Visit, User
- One-to-Many: Documents

---

### Referral

**Purpose:** Patient referral tracking

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  patient: ObjectId,              // Reference to Patient
  referringDoctor: ObjectId,     // Reference to Doctor
  referredToDoctor?: ObjectId,     // Reference to Doctor
  referredToFacility?: string,
  visit?: ObjectId,                // Reference to Visit
  appointment?: ObjectId,          // Reference to Appointment
  referralType: 'doctor_to_doctor' | 'patient_to_patient' | 'external',
  reason: string,
  status: 'pending' | 'accepted' | 'completed' | 'cancelled',
  notes?: string,
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-One: Patient, Doctor (Referring), Doctor (Referred To), Visit, Appointment

---

## Administrative Models

### Invoice

**Purpose:** Billing and payment tracking

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  invoiceNumber: string,          // Unique invoice number
  patient: ObjectId,               // Reference to Patient
  visit?: ObjectId,                // Reference to Visit
  items: Array<{
    description: string,
    quantity: number,
    unitPrice: number,
    total: number,
    service?: ObjectId            // Reference to Service
  }>,
  subtotal: number,
  discount: number,
  tax: number,
  total: number,
  paid: number,
  balance: number,
  status: 'draft' | 'pending' | 'paid' | 'partial' | 'overdue' | 'cancelled',
  paymentMethod?: 'cash' | 'card' | 'check' | 'online',
  payments: Array<{
    amount: number,
    method: string,
    date: Date,
    reference?: string
  }>,
  dueDate?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-One: Patient, Visit
- One-to-Many: Services (via items)

---

### InventoryItem

**Purpose:** Medicine and supply inventory tracking

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  medicine?: ObjectId,             // Reference to Medicine
  name: string,
  category: string,
  quantity: number,
  unit: string,                    // 'box', 'bottle', 'piece', etc.
  reorderLevel: number,
  expiryDate?: Date,
  batchNumber?: string,
  supplier?: string,
  costPrice?: number,
  sellingPrice?: number,
  status: 'in-stock' | 'low-stock' | 'out-of-stock' | 'expired',
  lastRestocked?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-One: Medicine

---

### Document

**Purpose:** Document storage and management

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  title: string,
  category: 'medical' | 'administrative' | 'financial' | 'legal' | 'other',
  type: 'pdf' | 'image' | 'word' | 'excel' | 'other',
  patient?: ObjectId,              // Reference to Patient
  visit?: ObjectId,                // Reference to Visit
  appointment?: ObjectId,          // Reference to Appointment
  labResult?: ObjectId,             // Reference to LabResult
  invoice?: ObjectId,               // Reference to Invoice
  fileUrl: string,                 // Cloudinary URL or base64
  fileSize: number,                // Bytes
  mimeType: string,
  uploadedBy: ObjectId,            // Reference to User
  description?: string,
  tags?: string[],
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-One: Patient, Visit, Appointment, LabResult, Invoice, User

---

### Membership

**Purpose:** Patient membership and loyalty program

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  patient: ObjectId,                // Reference to Patient
  tier: 'bronze' | 'silver' | 'gold' | 'platinum',
  status: 'active' | 'inactive' | 'expired' | 'suspended',
  points: number,
  totalPointsEarned: number,
  totalPointsRedeemed: number,
  joinedDate: Date,
  expiryDate?: Date,
  referredBy?: ObjectId,           // Reference to Patient
  referrals: ObjectId[],           // References to Patients
  benefits?: {
    discountPercentage?: number,
    freeConsultations?: number,
    priorityBooking?: boolean
  },
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- One-to-One: Patient
- Many-to-One: Patient (referredBy)
- One-to-Many: Patients (referrals)

---

## Supporting Models

### Queue

**Purpose:** Patient queue management

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  patient: ObjectId,               // Reference to Patient
  appointment?: ObjectId,           // Reference to Appointment
  visit?: ObjectId,                 // Reference to Visit
  doctor?: ObjectId,                // Reference to Doctor
  room?: ObjectId,                  // Reference to Room
  queueNumber: number,
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled',
  priority: 'normal' | 'urgent' | 'vip',
  estimatedWaitTime?: number,      // Minutes
  checkedInAt?: Date,
  calledAt?: Date,
  completedAt?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-One: Patient, Appointment, Visit, Doctor, Room

---

### Notification

**Purpose:** In-app notifications

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  user: ObjectId,                   // Reference to User
  type: 'info' | 'warning' | 'error' | 'success',
  priority: 'low' | 'medium' | 'high' | 'urgent',
  title: string,
  message: string,
  read: boolean,
  readAt?: Date,
  actionUrl?: string,
  metadata?: any,
  createdAt: Date,
  updatedAt: Date
}
```

**Relationships:**
- Many-to-One: User

---

### AuditLog

**Purpose:** Audit trail for compliance

**Key Fields:**
```typescript
{
  tenantId?: ObjectId,
  userId: ObjectId,                  // Reference to User
  userEmail: string,
  userRole: string,
  action: 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout' | 'export' | 'access',
  resource: 'patient' | 'visit' | 'appointment' | 'prescription' | 'invoice' | ...,
  resourceId?: ObjectId,
  ipAddress: string,
  userAgent: string,
  requestMethod: string,
  requestPath: string,
  changes?: Array<{
    field: string,
    oldValue: any,
    newValue: any
  }>,
  description: string,
  success: boolean,
  isSensitive: boolean,
  dataSubject?: ObjectId,            // Patient ID for PH DPA
  timestamp: Date
}
```

**Relationships:**
- Many-to-One: User, Patient (dataSubject)

---

## Model Relationships

### Relationship Diagram

```
AUTHENTICATION & AUTHORIZATION:
├── User → Role (many-to-one)
├── User → Permission[] (one-to-many)
├── User → [Admin|Doctor|Nurse|Receptionist|Accountant|MedicalRep] (one-to-one)
└── Role → Permission[] (many-to-many)

PATIENT CARE:
├── Patient (core entity)
├── Appointment → Patient, Doctor, User
├── Visit → Patient, User, Prescription[], LabResult[], Imaging[], Procedure[]
├── Prescription → Patient, Visit, User, Medicine
├── LabResult → Patient, Visit, User
├── Imaging → Patient, Visit, User
└── Procedure → Patient, Visit, User

QUEUE MANAGEMENT:
└── Queue → Patient, Appointment, Visit, Doctor, Room

BILLING:
├── Invoice → Patient, Visit, Service, User
└── Membership → Patient (referredBy, referrals)

REFERRALS:
└── Referral → Doctor, Patient, Visit, Appointment, User

DOCUMENTS:
├── Document → Patient, Visit, Appointment, LabResult, Invoice, User
└── Attachment (embedded subdocument)

CATALOG/REFERENCE:
├── Medicine
├── Service
├── Room
├── Specialization
└── Settings (singleton)

AUDIT & NOTIFICATIONS:
├── AuditLog → User, Patient
└── Notification → User

INVENTORY:
└── InventoryItem → Medicine, User
```

---

## Tenant Scoping

### Multi-Tenant Support

All models that support multi-tenancy include a `tenantId` field:

```typescript
tenantId?: Types.ObjectId  // Reference to Tenant
```

### Tenant-Scoped Models

The following models are tenant-scoped:
- User
- Patient
- Appointment
- Visit
- Prescription
- LabResult
- Invoice
- Document
- Queue
- Referral
- InventoryItem
- Membership
- Notification
- AuditLog

### Tenant Isolation

- Data is automatically filtered by `tenantId` in queries
- Users can only access data from their tenant
- Subdomain-based routing determines tenant context

---

## Indexes

### Common Indexes

Most models include indexes on:
- `tenantId` - For multi-tenant queries
- `createdAt` - For date-based queries
- Unique fields (email, codes, etc.)

### Performance Indexes

- Patient: `tenantId`, `email`, `phone`, `patientCode`
- Appointment: `tenantId`, `date`, `patient`, `doctor`, `status`
- Visit: `tenantId`, `date`, `patient`, `provider`, `status`
- Invoice: `tenantId`, `invoiceNumber`, `patient`, `status`
- Queue: `tenantId`, `status`, `queueNumber`

---

## Validation

### Common Validations

- Required fields are enforced
- Email format validation
- Phone number format validation
- Date range validation
- Enum values validation
- Reference validation (ObjectId exists)

### Custom Validations

- Patient code uniqueness (per tenant)
- Invoice number uniqueness (per tenant)
- Visit code uniqueness (per tenant)
- Email uniqueness (per tenant for users)

---

**For implementation details, see model files in `models/` directory.**

