# Database Schema & Models Documentation

## Overview

MyClinicSoft uses MongoDB with Mongoose ODM. The database implements a **multi-tenant architecture** with tenant isolation at the data layer.

**Total Models**: 37  
**Database**: MongoDB  
**ODM**: Mongoose  
**Location**: `models/` directory

---

## Table of Contents

1. [Core Models](#core-models)
2. [Clinical Models](#clinical-models)
3. [Administrative Models](#administrative-models)
4. [User & Access Control](#user--access-control)
5. [Integration Models](#integration-models)
6. [Model Relationships](#model-relationships)
7. [Indexes & Performance](#indexes--performance)
8. [Data Validation](#data-validation)

---

## Core Models

### Patient (`models/Patient.ts`)

Central model for patient information.

```typescript
interface IPatient {
  // Multi-tenant
  tenantIds: ObjectId[];              // Can belong to multiple clinics
  
  // Identification
  patientCode: string;                // Unique code (e.g., CLINIC-0001)
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  dateOfBirth: Date;
  sex: 'male' | 'female' | 'other';
  
  // Contact
  email?: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  
  // Emergency Contact
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  
  // IDs
  identifiers?: {
    philHealth?: string;
    govId?: string;
    other: Map<string, string>;
  };
  
  // Medical Info
  medicalHistory?: string;
  preExistingConditions: Array<{
    condition: string;
    diagnosisDate: Date;
    status: 'active' | 'resolved' | 'chronic';
    notes?: string;
  }>;
  allergies: Array<string | {
    substance: string;
    reaction: string;
    severity: string;
  }>;
  immunizations: Array<{
    name: string;
    date: Date;
    batch?: string;
  }>;
  
  // Lifestyle
  socialHistory?: {
    smoker: 'never' | 'former' | 'current' | 'unknown';
    alcohol: 'none' | 'social' | 'regular' | 'unknown';
    drugs: 'none' | 'occasional' | 'regular' | 'unknown';
    exercise: string;
    diet: string;
  };
  
  // Family History
  familyHistory?: Array<{
    relation: string;
    condition: string;
    notes?: string;
  }>;
  
  // Membership
  membershipStatus: 'none' | 'active' | 'expired';
  membershipPoints: number;
  referralCode?: string;
  referredBy?: ObjectId;             // Reference to Patient
  
  // Metadata
  status: 'active' | 'inactive' | 'deceased';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships**:
- ← One-to-Many with `Visit`
- ← One-to-Many with `Appointment`
- ← One-to-Many with `Prescription`
- ← One-to-Many with `LabResult`
- ← One-to-Many with `Invoice`
- ← One-to-Many with `Queue`
- → Many-to-Many with `Tenant` (via tenantIds)

**Indexes**:
```typescript
patientSchema.index({ tenantIds: 1, patientCode: 1 }, { unique: true });
patientSchema.index({ tenantIds: 1, email: 1 });
patientSchema.index({ tenantIds: 1, phone: 1 });
patientSchema.index({ firstName: 1, lastName: 1 });
```

---

### Appointment (`models/Appointment.ts`)

Appointment scheduling and management.

```typescript
interface IAppointment {
  // Multi-tenant
  tenantId: ObjectId;
  
  // Core fields
  appointmentCode: string;           // Unique code
  patient: ObjectId;                 // → Patient
  doctor: ObjectId;                  // → Doctor
  appointmentDate: Date;
  appointmentTime: string;           // "09:30"
  duration: number;                  // Minutes
  
  // Type & Status
  appointmentType: 'consultation' | 'follow-up' | 'checkup' | 'procedure' | 'teleconsult';
  status: 'scheduled' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  
  // Details
  reason: string;
  notes?: string;
  symptoms?: string[];
  
  // Room
  room?: ObjectId;                   // → Room
  
  // Reminders
  reminderSent: boolean;
  reminderSentAt?: Date;
  confirmationStatus: 'pending' | 'confirmed' | 'declined';
  
  // Cancellation
  cancelledAt?: Date;
  cancelReason?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships**:
- → Many-to-One with `Patient`
- → Many-to-One with `Doctor`
- → Many-to-One with `Room` (optional)
- ← OneToOne with `Queue` (when appointment starts)
- ← One-to-One with `Visit` (after completion)

**Indexes**:
```typescript
appointmentSchema.index({ tenantId: 1, appointmentCode: 1 }, { unique: true });
appointmentSchema.index({ tenantId: 1, patient: 1, appointmentDate: 1 });
appointmentSchema.index({ tenantId: 1, doctor: 1, appointmentDate: 1 });
appointmentSchema.index({ appointmentDate: 1, appointmentTime: 1 });
```

---

## Clinical Models

### Visit (`models/Visit.ts`)

Clinical consultation record (SOAP notes).

```typescript
interface IVisit {
  // Multi-tenant
  tenantId: ObjectId;
  
  // Core
  visitCode: string;
  patient: ObjectId;                 // → Patient
  date: Date;
  provider: ObjectId;                // → Doctor
  visitType: 'consultation' | 'follow-up' | 'checkup' | 'emergency' | 'teleconsult';
  
  // Clinical Data
  chiefComplaint: string;
  vitals: {
    bp?: string;                     // "120/80"
    hr?: number;
    rr?: number;
    tempC?: number;
    spo2?: number;
    heightCm?: number;
    weightKg?: number;
    bmi?: number;
  };
  
  // SOAP Notes
  soapNotes: {
    subjective: string;              // Patient's description
    objective: string;               // Measurable observations
    assessment: string;              // Clinical impression/diagnosis
    plan: string;                    // Treatment plan
  };
  
  // Physical Exam
  physicalExam: {
    general?: string;
    heent?: string;
    chest?: string;
    cardiovascular?: string;
    abdomen?: string;
    neuro?: string;
    skin?: string;
    other?: string;
  };
  
  // Diagnosis (ICD-10)
  diagnoses: Array<{
    icd10Code: string;
    description: string;
    type: 'primary' | 'secondary';
  }>;
  
  // Treatment Plan
  treatmentPlan: {
    medications: Array<{
      name: string;
      dosage: string;
      frequency: string;
      duration: string;
      instructions?: string;
    }>;
    procedures: Array<{
      name: string;
      description?: string;
      scheduledDate?: Date;
    }>;
    lifestyle: Array<{
      category: string;
      instructions: string;
    }>;
    followUp?: {
      date: Date;
      instructions: string;
      reminderSent: boolean;
    };
  };
  
  // Documents & Images
  attachments: Array<{
    type: 'image' | 'document' | 'lab-result' | 'xray';
    url: string;
    filename: string;
    uploadedAt: Date;
  }>;
  
  // E-Signature
  digitalSignature?: {
    providerName: string;
    providerId: ObjectId;
    signatureData: string;           // Base64
    signedAt: Date;
    ipAddress?: string;
  };
  
  // Related Records
  prescription?: ObjectId;           // → Prescription
  labOrders?: ObjectId[];            // → LabResult[]
  referral?: ObjectId;               // → Referral
  
  // Metadata
  status: 'in-progress' | 'completed' | 'cancelled';
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships**:
- → Many-to-One with `Patient`
- → Many-to-One with `Doctor`
- → One-to-One with `Prescription` (optional)
- → One-to-Many with `LabResult`
- → One-to-One with `Referral` (optional)
- ← Linked from `Queue` (active consultation)

---

### Prescription (`models/Prescription.ts`)

Electronic prescription management.

```typescript
interface IPrescription {
  // Multi-tenant
  tenantId: ObjectId;
  
  // Core
  prescriptionCode: string;
  patient: ObjectId;                 // → Patient
  doctor: ObjectId;                  // → Doctor
  visit?: ObjectId;                  // → Visit
  prescriptionDate: Date;
  
  // Medications
  medications: Array<{
    name: string;
    genericName?: string;
    dosage: string;                  // "500mg"
    form: string;                    // "tablet", "capsule", "syrup"
    frequency: string;               // "3x a day"
    duration: string;                // "7 days"
    quantity: number;
    instructions: string;            // "Take after meals"
    refills: number;
  }>;
  
  // Dispensing
  dispensedDate?: Date;
  dispensedBy?: string;
  pharmacy?: string;
  
  // Clinical Info
  diagnosis?: string;
  icd10Codes?: string[];
  
  // E-Signature
  digitalSignature: {
    doctorName: string;
    licenseNumber: string;
    signatureData: string;
    signedAt: Date;
  };
  
  // Status
  status: 'active' | 'dispensed' | 'cancelled' | 'expired';
  expiryDate: Date;
  
  // Metadata
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships**:
- → Many-to-One with `Patient`
- → Many-to-One with `Doctor`
- → Many-to-One with `Visit` (optional)

---

### LabResult (`models/LabResult.ts`)

Laboratory test results.

```typescript
interface ILabResult {
  // Multi-tenant
  tenantId: ObjectId;
  
  // Core
  resultCode: string;
  patient: ObjectId;                 // → Patient
  visit?: ObjectId;                  // → Visit
  orderedBy: ObjectId;               // → Doctor
  
  // Test Info
  testName: string;
  testType: 'blood' | 'urine' | 'imaging' | 'biopsy' | 'other';
  specimenType?: string;
  
  // Results
  results: Array<{
    parameter: string;
    value: string;
    unit: string;
    referenceRange: string;
    flag?: 'normal' | 'high' | 'low' | 'critical';
  }>;
  
  // Documents
  attachments: Array<{
    url: string;
    filename: string;
    type: 'pdf' | 'image';
  }>;
  
  // Dates
  orderDate: Date;
  collectionDate?: Date;
  resultDate?: Date;
  
  // Status
  status: 'ordered' | 'collected' | 'processing' | 'completed' | 'cancelled';
  
  // Lab Info
  laboratory?: string;
  technician?: string;
  pathologist?: string;
  
  // Interpretation
  interpretation?: string;
  criticalValue: boolean;
  abnormalFlags: Array<string>;
  
  // Notification
  patientNotified: boolean;
  notifiedAt?: Date;
  
  // Metadata
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships**:
- → Many-to-One with `Patient`
- → Many-to-One with `Doctor` (orderedBy)
- → Many-to-One with `Visit` (optional)

---

### Queue (`models/Queue.ts`)

Patient queue/waiting room management.

```typescript
interface IQueue {
  // Multi-tenant
  tenantId: ObjectId;
  
  // Core
  queueNumber: number;
  patient: ObjectId;                 // → Patient
  appointment?: ObjectId;            // → Appointment
  doctor?: ObjectId;                 // → Doctor
  room?: ObjectId;                   // → Room
  
  // Status
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled';
  priority: 'normal' | 'urgent' | 'emergency';
  
  // Vitals (recorded at check-in)
  vitals?: {
    bp: string;
    hr: number;
    rr: number;
    tempC: number;
    spo2: number;
    heightCm: number;
    weightKg: number;
    bmi: number;
  };
  
  // Timing
  queuedAt: Date;
  calledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  
  // Check-in
  checkInMethod: 'walk-in' | 'appointment' | 'qr-code';
  qrCode?: string;
  
  // Metadata
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships**:
- → Many-to-One with `Patient`
- → Many-to-One with `Appointment` (optional)
- → Many-to-One with `Doctor` (optional)
- → Many-to-One with `Room` (optional)

---

## Administrative Models

### Invoice (`models/Invoice.ts`)

Billing and payment tracking.

```typescript
interface IInvoice {
  // Multi-tenant
  tenantId: ObjectId;
  
  // Core
  invoiceNumber: string;
  patient: ObjectId;                 // → Patient
  visit?: ObjectId;                  // → Visit
  invoiceDate: Date;
  dueDate: Date;
  
  // Items
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    category: 'consultation' | 'procedure' | 'medication' | 'laboratory' | 'other';
  }>;
  
  // Amounts
  subtotal: number;
  discount: number;
  discountReason?: string;
  tax: number;
  total: number;
  
  // Payment
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overdue';
  amountPaid: number;
  balance: number;
  payments: Array<{
    date: Date;
    amount: number;
    method: 'cash' | 'card' | 'gcash' | 'bank-transfer' | 'insurance';
    reference?: string;
    receivedBy?: ObjectId;
  }>;
  
  // Insurance
  insurance?: {
    provider: string;
    policyNumber: string;
    claimAmount: number;
    claimStatus: 'pending' | 'approved' | 'denied';
  };
  
  // Metadata
  notes?: string;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships**:
- → Many-to-One with `Patient`
- → Many-to-One with `Visit` (optional)

---

### Inventory (`models/Inventory.ts`)

Medicine and supplies inventory.

```typescript
interface IInventory {
  // Multi-tenant
  tenantId: ObjectId;
  
  // Item Info
  itemCode: string;
  itemName: string;
  description?: string;
  category: 'medicine' | 'supply' | 'equipment' | 'consumable';
  
  // Medicine Specific
  genericName?: string;
  brandName?: string;
  dosageForm?: string;               // tablet, capsule, syrup
  strength?: string;                 // 500mg, 10mg/mL
  
  // Stock
  quantity: number;
  unit: string;                      // pieces, boxes, bottles
  reorderLevel: number;
  reorderQuantity: number;
  
  // Pricing
  costPrice: number;
  sellingPrice: number;
  
  // Supplier
  supplier?: string;
  supplierContact?: string;
  
  // Dates
  expiryDate?: Date;
  lastRestockDate?: Date;
  
  // Location
  storage: string;                   // Cabinet A, Shelf 3
  
  // Status
  status: 'in-stock' | 'low-stock' | 'out-of-stock' | 'expired';
  
  // Tracking
  transactions: Array<{
    date: Date;
    type: 'restock' | 'dispense' | 'adjustment' | 'return';
    quantity: number;
    reason?: string;
    userId: ObjectId;
  }>;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

---

### Document (`models/Document.ts`)

Document management system.

```typescript
interface IDocument {
  // Multi-tenant
  tenantId: ObjectId;
  
  // Core
  documentCode: string;
  title: string;
  description?: string;
  
  // File Info
  filename: string;
  fileUrl: string;                   // Cloudinary URL
  publicId: string;                  // Cloudinary public ID
  fileType: string;                  // mime type
  fileSize: number;                  // bytes
  
  // Categorization
  category: 'medical-record' | 'lab-result' | 'imaging' | 'consent-form' | 'insurance' | 'legal' | 'other';
  tags: string[];
  
  // Relations
  patient?: ObjectId;                // → Patient
  visit?: ObjectId;                  // → Visit
  uploadedBy: ObjectId;              // → User
  
  // Access Control
  public: boolean;
  sharedWith: ObjectId[];            // User IDs
  
  // Metadata
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## User & Access Control

### User (`models/User.ts`)

System user accounts.

```typescript
interface IUser {
  // Multi-tenant
  tenantId: ObjectId;                // → Tenant
  
  // Credentials
  email: string;
  password: string;                  // Hashed (bcrypt)
  name: string;
  
  // Authorization
  role: ObjectId;                    // → Role
  
  // Profile Links
  doctorProfile?: ObjectId;          // → Doctor
  nurseProfile?: ObjectId;           // → Nurse
  receptionistProfile?: ObjectId;    // → Receptionist
  accountantProfile?: ObjectId;      // → Accountant
  adminProfile?: ObjectId;           // → Admin
  
  // Status
  status: 'active' | 'inactive' | 'suspended';
  lastLogin?: Date;
  
  // Password Reset
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships**:
- → Many-to-One with `Tenant`
- → Many-to-One with `Role`
- → One-to-One with profile models (Doctor, Nurse, etc.)

**Indexes**:
```typescript
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, email: 1 });
```

---

### Role (`models/Role.ts`)

Role-based access control.

```typescript
interface IRole {
  // Multi-tenant
  tenantId?: ObjectId;               // Global roles have no tenant
  
  // Role Info
  name: string;                      // 'admin', 'doctor', 'nurse', etc.
  displayName: string;
  description?: string;
  level: number;                     // Hierarchical level (100=admin, 80=doctor, etc.)
  
  // Permissions
  permissions: ObjectId[];           // → Permission[]
  defaultPermissions: Array<{
    resource: string;
    actions: string[];
  }>;
  
  // Status
  isActive: boolean;
  isSystem: boolean;                 // System roles can't be deleted
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

---

### Permission (`models/Permission.ts`)

Granular permissions.

```typescript
interface IPermission {
  // Multi-tenant
  tenantId?: ObjectId;
  
  // Permission
  role: ObjectId;                    // → Role
  resource: string;                  // 'patients', 'visits', 'invoices', etc.
  actions: string[];                 // ['create', 'read', 'update', 'delete']
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Integration Models

### MedicalRepresentative (`models/MedicalRepresentative.ts`)

Pharmaceutical representative tracking.

```typescript
interface IMedicalRepresentative {
  // Multi-tenant (can visit multiple clinics)
  tenantIds: ObjectId[];
  
  // Personal Info
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  
  // Company Info
  company: string;
  position: string;
  territory: string;
  
  // Products
  products: Array<{
    name: string;
    category: string;
    description?: string;
  }>;
  
  // Status
  status: 'active' | 'inactive';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedBy?: ObjectId;
  approvedAt?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

---

### Tenant (`models/Tenant.ts`)

Multi-tenant organization.

```typescript
interface ITenant {
  // Identification
  name: string;
  subdomain: string;                 // Unique subdomain
  displayName?: string;
  
  // Contact
  email?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  
  // Subscription
  plan: 'free' | 'trial' | 'basic' | 'premium' | 'enterprise';
  subscriptionStatus: 'active' | 'trial' | 'expired' | 'suspended';
  trialEndsAt?: Date;
  subscriptionEndsAt?: Date;
  
  // Configuration
  settings?: {
    timezone: string;
    currency: string;
    language: string;
    dateFormat: string;
  };
  
  // Branding
  logo?: string;
  primaryColor?: string;
  
  // Status
  status: 'active' | 'inactive' | 'suspended';
  
  // Metadata
  onboardedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes**:
```typescript
tenantSchema.index({ subdomain: 1 }, { unique: true });
```

---

## Model Relationships

### Entity Relationship Diagram

```
┌──────────────┐
│    Tenant    │
└──────┬───────┘
       │
       │ 1:N
       │
       ├─────────────┬────────────┬─────────────┬──────────────┐
       │             │            │             │              │
┌──────▼───────┐ ┌──▼──────┐ ┌──▼────────┐ ┌──▼─────────┐ ┌─▼────────┐
│    Patient   │ │  Doctor │ │ Appoitmt. │ │  Invoice   │ │  User    │
└──────┬───────┘ └──┬──────┘ └──┬────────┘ └──┬─────────┘ └─┬────────┘
       │            │            │             │              │
       │ 1:N        │ 1:N        │ 1:1         │ N:1          │ N:1
       │            │            │             │              │
    ┌──▼────────────▼────────────▼─────────────▼──┐        ┌─▼──────┐
    │              Visit                          │        │  Role  │
    └──┬───────────────────────────────────┬──────┘        └────────┘
       │                                   │
       │ 1:1                               │ 1:N
       │                                   │
    ┌──▼──────────┐                    ┌──▼────────┐
    │Prescription │                    │ LabResult │
    └─────────────┘                    └───────────┘
```

### Key Relationships

1. **Patient-centric**:
   - Patient → Appointments (1:N)
   - Patient → Visits (1:N)
   - Patient → Prescriptions (1:N)
   - Patient → LabResults (1:N)
   - Patient → Invoices (1:N)
   - Patient → Queue (1:N)

2. **Clinical Workflow**:
   - Appointment → Queue (1:1) - When patient checks in
   - Queue → Visit (1:1) - During consultation
   - Visit → Prescription (1:1) - If medications prescribed
   - Visit → LabResults (1:N) - Lab tests ordered

3. **Multi-tenant**:
   - Tenant → All models (1:N via tenantId)
   - Patient → Tenants (N:M via tenantIds) - Can visit multiple clinics

4. **Access Control**:
   - User → Role (N:1)
   - Role → Permissions (1:N)
   - User → Profile (1:1) - Links to Doctor, Nurse, etc.

---

## Indexes & Performance

### Critical Indexes

```typescript
// Patient lookups
{ tenantIds: 1, patientCode: 1 }          // Unique identifier
{ tenantIds: 1, email: 1 }                // Email search
{ firstName: 1, lastName: 1 }             // Name search

// Appointment queries
{ tenantId: 1, doctor: 1, appointmentDate: 1 }  // Doctor schedule
{ tenantId: 1, patient: 1, appointmentDate: 1 } // Patient appointments
{ appointmentDate: 1, appointmentTime: 1 }      // Calendar view

// Queue management
{ tenantId: 1, status: 1, queuedAt: 1 }  // Active queue
{ patient: 1, queuedAt: -1 }             // Patient history

// Billing
{ tenantId: 1, patient: 1, invoiceDate: 1 }  // Patient invoices
{ tenantId: 1, paymentStatus: 1 }            // Unpaid invoices

// Audit
{ tenantId: 1, timestamp: -1 }          // Recent logs
{ userId: 1, timestamp: -1 }            // User activity
{ resource: 1, resourceId: 1 }          // Resource access
```

### Query Optimization

```typescript
// Use lean() for read-only queries
const patients = await Patient.find({ tenantId })
  .lean()                              // 5x faster
  .select('firstName lastName email'); // Only needed fields

// Use aggregation for complex queries
const stats = await Visit.aggregate([
  { $match: { tenantId: new ObjectId(tenantId) } },
  { $group: {
    _id: '$provider',
    count: { $sum: 1 },
    totalRevenue: { $sum: '$amount' }
  }}
]);

// Batch operations
await Patient.insertMany(patients);    // Better than multiple creates
```

---

## Data Validation

### Schema Validation

```typescript
// Required fields
firstName: { 
  type: String, 
  required: true,
  trim: true,
  maxlength: 100
}

// Enum values
status: { 
  type: String, 
  enum: ['active', 'inactive', 'suspended'],
  default: 'active'
}

// Custom validation
email: {
  type: String,
  validate: {
    validator: (v) => /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v),
    message: 'Invalid email format'
  }
}

// Unique constraints
patientCode: {
  type: String,
  unique: true,
  sparse: true                          // Allow null values
}
```

### Pre-save Hooks

```typescript
// Auto-generate codes
patientSchema.pre('save', async function(next) {
  if (!this.patientCode) {
    const count = await Patient.countDocuments({ tenantIds: this.tenantIds[0] });
    this.patientCode = `PAT-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Update timestamps
schema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Hash passwords
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});
```

---

## Migration Guide

### Adding New Fields

```typescript
// 1. Update model interface
interface IPatient {
  // ... existing fields
  newField?: string;  // Optional for backward compatibility
}

// 2. Update schema
const patientSchema = new Schema({
  // ... existing fields
  newField: { type: String, required: false }
});

// 3. Run migration (if needed)
await Patient.updateMany(
  { newField: { $exists: false } },
  { $set: { newField: 'default-value' } }
);
```

### Schema Versioning

```typescript
const patientSchema = new Schema({
  // ... fields
  __v: { type: Number }  // Mongoose version key
});

// Custom version tracking
const patientSchema = new Schema({
  schemaVersion: { type: Number, default: 2 }
});
```

---

## Best Practices

1. **Always filter by tenantId** for multi-tenant queries
2. **Use indexes** for frequently queried fields
3. **Validate input** at schema level
4. **Use transactions** for related updates
5. **Implement soft deletes** (status field) instead of hard deletes
6. **Log all changes** via audit logs
7. **Use references** (ObjectId) not embedded documents for large datasets
8. **Populate sparingly** - only when needed
9. **Use projections** to limit returned fields
10. **Implement pagination** for large result sets

---

**Last Updated**: February 14, 2026  
**Version**: 1.0.0  
**Total Models**: 37
