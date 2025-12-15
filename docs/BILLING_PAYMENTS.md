# Billing & Payments System

This document describes the Billing & Payments features implemented in MyClinicSoft.

## Features Overview

### 1. Consultation Fees

- **Service Catalog**: All consultation types and fees are managed through the Service catalog
- **Auto-calculation**: Consultation fees are automatically calculated when services are added to invoices
- **Flexible Pricing**: Each service can have its own unit price and can be customized per invoice

### 2. Procedures & Services Catalog

The system includes a comprehensive Service catalog model (`models/Service.ts`) that supports:

- **Service Categories**:
  - Consultation
  - Procedure
  - Laboratory
  - Imaging
  - Medication
  - Other

- **Service Properties**:
  - Code (auto-generated or manual)
  - Name and description
  - Category and type
  - Unit price
  - Unit (e.g., "per visit", "per procedure")
  - Duration (for procedures)
  - Active/inactive status

**API Endpoints:**
- `GET /api/services` - List all services (with filters: category, active, search)
- `POST /api/services` - Create new service (admin only)
- `GET /api/services/[id]` - Get service details
- `PUT /api/services/[id]` - Update service (admin only)
- `DELETE /api/services/[id]` - Deactivate service (admin only)

### 3. Discounts (PWD, Senior, Membership)

The system supports multiple discount types:

#### Discount Types:
- **PWD (Persons with Disabilities)**: 20% discount (configurable)
- **Senior Citizen**: 20% discount (auto-detected for 60+ years old)
- **Membership**: Variable discount percentage based on membership type
- **Promotional**: Custom promotional discounts
- **Other**: Custom discounts

#### Patient Discount Eligibility:
Patients can have discount eligibility stored in their profile:
```typescript
discountEligibility: {
  pwd: {
    eligible: boolean,
    idNumber: string,
    expiryDate: Date
  },
  senior: {
    eligible: boolean,
    idNumber: string
  },
  membership: {
    eligible: boolean,
    membershipType: string,
    membershipNumber: string,
    expiryDate: Date,
    discountPercentage: number
  }
}
```

#### Discount Calculation:
- Automatic calculation based on patient eligibility
- Percentage-based or fixed amount discounts
- Multiple discounts can be applied (business logic determines which)
- Discounts are tracked with type, reason, and applied by user

**Utility Functions:**
- `calculateDiscounts()` - Calculate applicable discounts for a patient
- `isSeniorCitizen()` - Check if patient is 60+ years old
- `getBestDiscount()` - Get the highest discount
- `applyDiscounts()` - Apply discounts to subtotal

### 4. Insurance/HMO Module

The Invoice model includes comprehensive Insurance/HMO support:

```typescript
insurance: {
  provider: string,           // Insurance/HMO company name
  policyNumber: string,      // Policy number
  memberId: string,          // Member ID
  coverageType: 'full' | 'partial' | 'co-pay',
  coverageAmount: number,     // Amount covered by insurance
  claimNumber: string,       // Claim reference number
  status: 'pending' | 'approved' | 'rejected' | 'paid',
  notes: string
}
```

**Features:**
- Track insurance provider and policy information
- Support for full, partial, or co-pay coverage
- Claim tracking with status
- Coverage amount calculation
- Notes for additional information

### 5. Payment Methods

The system supports multiple payment methods:

- **Cash**: Traditional cash payments
- **GCash**: Digital wallet payments (Philippines)
- **Bank Transfer**: Bank transfer payments
- **Card**: Credit/Debit card payments
- **Check**: Check payments
- **Insurance**: Insurance claim payments
- **HMO**: HMO coverage payments
- **Other**: Custom payment methods

**Payment Tracking:**
Each payment includes:
- Payment method
- Amount
- Date and time
- Receipt number
- Reference number (for GCash, bank transfer, etc.)
- Processed by (user who processed the payment)
- Notes

### 6. EOR/Receipt Generation

The system generates professional Electronic Official Receipts (EOR):

**Features:**
- Professional HTML receipt format
- Print-ready layout
- Includes all invoice details
- Payment history
- Outstanding balance (if any)
- Insurance/HMO information
- Patient information
- Itemized billing

**API Endpoint:**
- `GET /api/invoices/[id]/receipt` - Generate printable receipt

**Receipt Includes:**
- Receipt number and date
- Patient information
- Itemized services
- Subtotal, discounts, tax, total
- Payment details (all payments)
- Outstanding balance
- Insurance/HMO information
- Footer with generation timestamp

### 7. Outstanding Balances Tracking

The system automatically tracks outstanding balances:

**Features:**
- Automatic calculation: `outstandingBalance = total - totalPaid`
- Status tracking: unpaid, partial, paid, refunded
- Per-patient outstanding balance tracking
- System-wide outstanding balance reports

**API Endpoints:**
- `GET /api/patients/[id]/outstanding-balance` - Get patient's outstanding balance
- `GET /api/invoices/outstanding` - Get all outstanding invoices (with optional patient filter)

**Outstanding Balance Data:**
```typescript
{
  totalOutstanding: number,
  invoiceCount: number,
  invoices: Array<{
    invoiceNumber: string,
    total: number,
    outstandingBalance: number,
    status: string,
    createdAt: Date
  }>
}
```

## Invoice Model

The enhanced Invoice model includes:

```typescript
{
  patient: ObjectId,
  visit: ObjectId (optional),
  invoiceNumber: string,
  items: Array<{
    serviceId: ObjectId,
    code: string,
    description: string,
    category: string,
    quantity: number,
    unitPrice: number,
    total: number
  }>,
  subtotal: number,
  discounts: Array<{
    type: 'pwd' | 'senior' | 'membership' | 'promotional' | 'other',
    reason: string,
    percentage: number,
    amount: number,
    appliedBy: ObjectId
  }>,
  tax: number,
  total: number,
  payments: Array<{
    method: 'cash' | 'gcash' | 'bank_transfer' | 'card' | 'check' | 'insurance' | 'hmo' | 'other',
    amount: number,
    date: Date,
    receiptNo: string,
    referenceNo: string,
    processedBy: ObjectId,
    notes: string
  }>,
  insurance: {
    provider: string,
    policyNumber: string,
    memberId: string,
    coverageType: 'full' | 'partial' | 'co-pay',
    coverageAmount: number,
    claimNumber: string,
    status: 'pending' | 'approved' | 'rejected' | 'paid',
    notes: string
  },
  outstandingBalance: number,
  totalPaid: number,
  status: 'unpaid' | 'partial' | 'paid' | 'refunded',
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints

### Invoices
- `GET /api/invoices` - List invoices (filters: patientId, visitId, status)
- `POST /api/invoices` - Create new invoice
- `GET /api/invoices/[id]` - Get invoice details
- `PUT /api/invoices/[id]` - Update invoice
- `POST /api/invoices/[id]/payment` - Record payment
- `GET /api/invoices/[id]/receipt` - Generate receipt

### Services
- `GET /api/services` - List services (filters: category, active, search)
- `POST /api/services` - Create service (admin only)
- `GET /api/services/[id]` - Get service details
- `PUT /api/services/[id]` - Update service (admin only)
- `DELETE /api/services/[id]` - Deactivate service (admin only)

### Outstanding Balances
- `GET /api/patients/[id]/outstanding-balance` - Get patient outstanding balance
- `GET /api/invoices/outstanding` - Get all outstanding invoices

## Usage Examples

### Creating an Invoice

```javascript
POST /api/invoices
{
  "patient": "patient_id",
  "visit": "visit_id", // optional
  "items": [
    {
      "serviceId": "service_id",
      "code": "CONSULT-001",
      "description": "General Consultation",
      "category": "consultation",
      "quantity": 1,
      "unitPrice": 500,
      "total": 500
    }
  ],
  "discounts": [
    {
      "type": "senior",
      "reason": "Senior Citizen Discount",
      "percentage": 20,
      "amount": 100
    }
  ],
  "tax": 0,
  "insurance": {
    "provider": "PhilHealth",
    "policyNumber": "PH123456",
    "coverageType": "partial",
    "coverageAmount": 200
  }
}
```

### Recording a Payment

```javascript
POST /api/invoices/[id]/payment
{
  "method": "gcash",
  "amount": 400,
  "receiptNo": "RCP-001",
  "referenceNo": "GCASH-123456789",
  "notes": "Payment via GCash"
}
```

### Getting Outstanding Balance

```javascript
GET /api/patients/[id]/outstanding-balance

Response:
{
  "success": true,
  "data": {
    "totalOutstanding": 1500,
    "invoiceCount": 3,
    "invoices": [...]
  }
}
```

## Business Logic

### Discount Application
1. System checks patient's discount eligibility
2. Calculates applicable discounts (PWD, Senior, Membership)
3. Applies the best discount or combines based on business rules
4. Tracks discount type, reason, and who applied it

### Payment Processing
1. Payment is recorded with method, amount, and reference
2. Total paid is recalculated
3. Outstanding balance is updated
4. Invoice status is updated (unpaid → partial → paid)

### Outstanding Balance Calculation
- Calculated automatically: `outstandingBalance = total - totalPaid`
- Updated whenever:
  - Invoice is created
  - Invoice items are modified
  - Payment is recorded
  - Discounts are applied

## Future Enhancements

- Payment reminders for outstanding balances
- Payment plans/installments
- Refund processing
- Payment gateway integration (for online payments)
- Automated discount application based on patient profile
- Insurance claim submission automation
- Financial reports and analytics
- Integration with accounting systems

