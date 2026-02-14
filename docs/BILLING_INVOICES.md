# Billing & Invoices Management Guide

Complete guide for managing invoices, payments, discounts, insurance claims, and professional fees in MyClinicSoft.

---

## Table of Contents

1. [Overview](#overview)
2. [Invoice Model](#invoice-model)
3. [Creating Invoices](#creating-invoices)
4. [Payment Processing](#payment-processing)
5. [Discounts & Promotions](#discounts--promotions)
6. [Insurance & HMO](#insurance--hmo)
7. [Professional Fees](#professional-fees)
8. [Outstanding Balances](#outstanding-balances)
9. [API Reference](#api-reference)
10. [UI Components](#ui-components)
11. [Best Practices](#best-practices)

---

## Overview

MyClinicSoft provides comprehensive billing management including:
- **Invoice generation** with itemized billing
- **Multiple payment methods** (cash, card, GCash, bank transfer, insurance)
- **Discount types** (PWD, Senior Citizen, membership, promotional)
- **Insurance/HMO integration** with claim tracking
- **Professional fee tracking** separate from facility fees
- **Outstanding balance management**
- **Payment history** and receipts
- **Multi-tenant billing** with currency support

### Payment Flow

```
Consultation → Create Invoice → Apply Discounts → Process Payment → Print Receipt
                                                          ↓
                                                   Insurance Claim (optional)
```

---

## Invoice Model

**File**: `models/Invoice.ts`

```typescript
interface IInvoice {
  // Identification
  tenantId?: ObjectId;
  invoiceNumber: string;           // "INV-000123"
  
  // Relationships
  patient: ObjectId;               // → Patient
  visit?: ObjectId;                // → Visit
  
  // Items
  items: Array<{
    serviceId?: ObjectId;          // → Service catalog
    code?: string;                 // Service code
    description?: string;          // "Consultation Fee"
    category?: string;             // 'consultation', 'procedure', 'lab', 'medication'
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  
  // Calculations
  subtotal?: number;
  tax?: number;
  total?: number;
  
  // Professional Fee (doctor's fee)
  professionalFee?: number;
  professionalFeeDoctor?: ObjectId;  // → Doctor
  professionalFeeType?: 'consultation' | 'procedure' | 'reading' | 'other';
  professionalFeeNotes?: string;
  
  // Discounts
  discounts: Array<{
    type: 'pwd' | 'senior' | 'membership' | 'promotional' | 'other';
    reason?: string;
    percentage?: number;           // 0-100
    amount: number;                // Fixed amount
    appliedBy?: ObjectId;          // → User
  }>;
  
  // Payments
  payments: Array<{
    method: 'cash' | 'gcash' | 'bank_transfer' | 'card' | 'check' | 'insurance' | 'hmo' | 'other';
    amount: number;
    date: Date;
    receiptNo?: string;
    referenceNo?: string;          // GCash/bank reference
    processedBy?: ObjectId;        // → User
    notes?: string;
  }>;
  
  // Insurance/HMO
  insurance?: {
    provider: string;              // "PhilHealth", "Maxicare"
    policyNumber?: string;
    memberId?: string;
    coverageType?: 'full' | 'partial' | 'co-pay';
    coverageAmount?: number;
    claimNumber?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'paid';
    notes?: string;
  };
  
  // Balance
  totalPaid?: number;              // Sum of all payments
  outstandingBalance?: number;     // total - totalPaid
  status: 'unpaid' | 'partial' | 'paid' | 'refunded';
  
  createdAt: Date;
  createdBy?: ObjectId;
  updatedAt: Date;
}
```

---

## Creating Invoices

### Basic Invoice

**API Endpoint**: `POST /api/invoices`

```typescript
const createInvoice = async (invoiceData) => {
  const response = await fetch('/api/invoices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      patient: '64p123...',
      visit: '64v123...',
      items: [
        {
          description: 'Consultation Fee',
          category: 'consultation',
          quantity: 1,
          unitPrice: 500,
          total: 500
        },
        {
          description: 'CBC Test',
          category: 'laboratory',
          quantity: 1,
          unitPrice: 350,
          total: 350
        }
      ],
      subtotal: 850,
      tax: 0,
      total: 850
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
    "_id": "64i123...",
    "invoiceNumber": "INV-000123",
    "patient": {
      "_id": "64p123...",
      "firstName": "Maria",
      "lastName": "Santos",
      "patientCode": "PAT-000001"
    },
    "items": [
      {
        "description": "Consultation Fee",
        "category": "consultation",
        "quantity": 1,
        "unitPrice": 500,
        "total": 500
      }
    ],
    "subtotal": 850,
    "total": 850,
    "status": "unpaid",
    "outstandingBalance": 850,
    "createdAt": "2024-02-14T10:00:00Z"
  }
}
```

### Invoice from Service Catalog

```typescript
const createInvoiceFromCatalog = async (patientId, visitId, serviceIds) => {
  // 1. Fetch services from catalog
  const services = await getServices(serviceIds);
  
  // 2. Build items from services
  const items = services.map(service => ({
    serviceId: service._id,
    code: service.code,
    description: service.name,
    category: service.category,
    quantity: 1,
    unitPrice: service.price,
    total: service.price
  }));
  
  // 3. Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  
  // 4. Create invoice
  const response = await fetch('/api/invoices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      patient: patientId,
      visit: visitId,
      items: items,
      subtotal: subtotal,
      total: subtotal
    })
  });
  
  return await response.json();
};
```

### Invoice with Professional Fee

```typescript
const createInvoiceWithPF = async (invoiceData) => {
  const response = await fetch('/api/invoices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      patient: '64p123...',
      visit: '64v123...',
      items: [
        {
          description: 'Thyroid Ultrasound',
          category: 'imaging',
          quantity: 1,
          unitPrice: 1500,
          total: 1500
        }
      ],
      subtotal: 1500,
      // Professional fee (doctor's reading fee)
      professionalFee: 800,
      professionalFeeDoctor: '64d123...',
      professionalFeeType: 'reading',
      professionalFeeNotes: 'Ultrasound reading and interpretation',
      total: 2300  // subtotal + professionalFee
    })
  });
  
  return await response.json();
};
```

---

## Payment Processing

### Record Payment

**API Endpoint**: `POST /api/invoices/:id/payment`

```typescript
const recordPayment = async (invoiceId, paymentData) => {
  const response = await fetch(`/api/invoices/${invoiceId}/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      method: 'cash',               // or 'gcash', 'card', etc.
      amount: 850,
      date: new Date(),
      receiptNo: 'OR-123456',
      notes: 'Full payment'
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
    "_id": "64i123...",
    "invoiceNumber": "INV-000123",
    "total": 850,
    "totalPaid": 850,
    "outstandingBalance": 0,
    "status": "paid",
    "payments": [
      {
        "method": "cash",
        "amount": 850,
        "date": "2024-02-14T10:30:00Z",
        "receiptNo": "OR-123456",
        "processedBy": {
          "name": "Maria Santos",
          "email": "maria@clinic.com"
        }
      }
    ]
  }
}
```

### Partial Payment

```typescript
// Payment 1: Partial
await recordPayment('64i123...', {
  method: 'cash',
  amount: 500,
  date: new Date(),
  receiptNo: 'OR-123456',
  notes: 'Partial payment - 50% down'
});

// Invoice status: 'partial'
// outstandingBalance: 350

// Payment 2: Complete remaining
await recordPayment('64i123...', {
  method: 'gcash',
  amount: 350,
  date: new Date(),
  referenceNo: 'GCASH-789012',
  notes: 'Final payment'
});

// Invoice status: 'paid'
// outstandingBalance: 0
```

### Payment Methods

**Cash**:
```typescript
await recordPayment(invoiceId, {
  method: 'cash',
  amount: 850,
  receiptNo: 'OR-123456'
});
```

**GCash**:
```typescript
await recordPayment(invoiceId, {
  method: 'gcash',
  amount: 850,
  referenceNo: 'GCASH-123456789',
  notes: 'GCash mobile number: 09123456789'
});
```

**Bank Transfer**:
```typescript
await recordPayment(invoiceId, {
  method: 'bank_transfer',
  amount: 850,
  referenceNo: 'BDO-20240214-001',
  notes: 'BDO account transfer'
});
```

**Credit/Debit Card**:
```typescript
await recordPayment(invoiceId, {
  method: 'card',
  amount: 850,
  referenceNo: 'CARD-****1234',
  notes: 'Visa ending in 1234'
});
```

---

## Discounts & Promotions

### Senior Citizen Discount (20%)

**Philippines Law**: Senior citizens (60+) get 20% discount

```typescript
const applySeniorDiscount = async (invoiceId, subtotal) => {
  const discountAmount = subtotal * 0.20;
  
  const response = await fetch(`/api/invoices/${invoiceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      discounts: [{
        type: 'senior',
        reason: 'Senior Citizen ID: SC-123456',
        percentage: 20,
        amount: discountAmount,
        appliedBy: userId
      }],
      total: subtotal - discountAmount
    })
  });
  
  return await response.json();
};

// Example:
// Subtotal: 1000
// Senior discount (20%): -200
// Total: 800
```

### PWD Discount (20%)

**Philippines Law**: Persons with Disability get 20% discount

```typescript
const applyPWDDiscount = async (invoiceId, subtotal) => {
  const discountAmount = subtotal * 0.20;
  
  const response = await fetch(`/api/invoices/${invoiceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      discounts: [{
        type: 'pwd',
        reason: 'PWD ID: PWD-789012',
        percentage: 20,
        amount: discountAmount,
        appliedBy: userId
      }],
      total: subtotal - discountAmount
    })
  });
  
  return await response.json();
};
```

### Membership Discount

```typescript
const applyMembershipDiscount = async (invoiceId, membershipTier) => {
  // Get discount percentage based on tier
  const discountPercentages = {
    'bronze': 5,
    'silver': 10,
    'gold': 15,
    'platinum': 20
  };
  
  const percentage = discountPercentages[membershipTier] || 0;
  const discountAmount = subtotal * (percentage / 100);
  
  const response = await fetch(`/api/invoices/${invoiceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      discounts: [{
        type: 'membership',
        reason: `${membershipTier.toUpperCase()} member`,
        percentage: percentage,
        amount: discountAmount,
        appliedBy: userId
      }],
      total: subtotal - discountAmount
    })
  });
  
  return await response.json();
};
```

### Promotional Discount

```typescript
const applyPromoCode = async (invoiceId, promoCode) => {
  // Validate promo code
  const promo = await validatePromoCode(promoCode);
  
  if (!promo.valid) {
    throw new Error('Invalid promo code');
  }
  
  const discountAmount = promo.type === 'percentage' 
    ? subtotal * (promo.value / 100)
    : promo.value;
  
  const response = await fetch(`/api/invoices/${invoiceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      discounts: [{
        type: 'promotional',
        reason: `Promo code: ${promoCode}`,
        percentage: promo.type === 'percentage' ? promo.value : null,
        amount: discountAmount,
        appliedBy: userId
      }],
      total: subtotal - discountAmount
    })
  });
  
  return await response.json();
};
```

---

## Insurance & HMO

### PhilHealth Claims

```typescript
const applyPhilHealthCoverage = async (invoiceId, philHealthDetails) => {
  const response = await fetch(`/api/invoices/${invoiceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      insurance: {
        provider: 'PhilHealth',
        policyNumber: philHealthDetails.policyNumber,
        memberId: philHealthDetails.memberId,
        coverageType: 'partial',
        coverageAmount: 500,          // PhilHealth coverage
        status: 'pending',
        notes: 'Awaiting PhilHealth approval'
      },
      // Patient pays remaining amount
      outstandingBalance: total - 500
    })
  });
  
  return await response.json();
};
```

### HMO Processing

```typescript
const processHMOClaim = async (invoiceId, hmoDetails) => {
  const response = await fetch(`/api/invoices/${invoiceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      insurance: {
        provider: hmoDetails.provider,   // 'Maxicare', 'Medicard', etc.
        policyNumber: hmoDetails.policyNumber,
        memberId: hmoDetails.memberId,
        coverageType: hmoDetails.coverageType,  // 'full' | 'partial' | 'co-pay'
        coverageAmount: hmoDetails.coverageAmount,
        claimNumber: generateClaimNumber(),
        status: 'pending'
      }
    })
  });
  
  // Submit claim to HMO (via API or manual)
  await submitHMOClaim(hmoDetails);
  
  return await response.json();
};
```

### Co-Payment

```typescript
// HMO covers 80%, patient pays 20%
const processCoPay = async (invoiceId, total) => {
  const hmoCoverage = total * 0.80;
  const patientCoPay = total * 0.20;
  
  await applyHMOCoverage(invoiceId, {
    coverageType: 'co-pay',
    coverageAmount: hmoCoverage
  });
  
  // Patient pays co-pay immediately
  await recordPayment(invoiceId, {
    method: 'cash',
    amount: patientCoPay,
    notes: '20% co-payment'
  });
  
  // Status: 'partial' until HMO payment received
};
```

---

## Professional Fees

### Consultation Professional Fee

```typescript
const invoiceWithConsultationFee = {
  items: [
    {
      description: 'Consultation - Cardiology',
      category: 'consultation',
      quantity: 1,
      unitPrice: 1000,
      total: 1000
    }
  ],
  professionalFee: 800,              // Doctor's fee
  professionalFeeDoctor: doctorId,
  professionalFeeType: 'consultation',
  subtotal: 1000,
  total: 1800                        // Facility fee + PF
};
```

### Procedure Professional Fee

```typescript
const invoiceWithProcedureFee = {
  items: [
    {
      description: 'Minor Surgery - Cyst Removal',
      category: 'procedure',
      quantity: 1,
      unitPrice: 5000,                // Facility fee
      total: 5000
    }
  ],
  professionalFee: 3000,             // Surgeon's fee
  professionalFeeDoctor: surgeonId,
  professionalFeeType: 'procedure',
  professionalFeeNotes: 'Surgical fee for cyst removal',
  total: 8000
};
```

### Reading Fee (Imaging/Lab)

```typescript
const invoiceWithReadingFee = {
  items: [
    {
      description: 'ECG',
      category: 'diagnostic',
      quantity: 1,
      unitPrice: 300,
      total: 300
    }
  ],
  professionalFee: 200,              // Doctor's reading fee
  professionalFeeDoctor: cardiologistId,
  professionalFeeType: 'reading',
  professionalFeeNotes: 'ECG interpretation',
  total: 500
};
```

---

## Outstanding Balances

### View Outstanding Invoices

**API Endpoint**: `GET /api/invoices/outstanding`

```typescript
const getOutstandingInvoices = async () => {
  const response = await fetch('/api/invoices/outstanding', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
};
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "64i123...",
      "invoiceNumber": "INV-000123",
      "patient": {
        "firstName": "Maria",
        "lastName": "Santos"
      },
      "total": 2000,
      "totalPaid": 500,
      "outstandingBalance": 1500,
      "status": "partial",
      "createdAt": "2024-02-01T10:00:00Z"
    }
  ],
  "summary": {
    "totalOutstanding": 15000,
    "overdueCount": 5,
    "partialPaymentCount": 10
  }
}
```

### Patient Outstanding Balance

```typescript
const getPatientBalance = async (patientId) => {
  const response = await fetch(`/api/patients/${patientId}/outstanding-balance`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
};
```

### Payment Plan

```typescript
const createPaymentPlan = async (invoiceId, installments) => {
  const invoice = await getInvoice(invoiceId);
  const perInstallment = invoice.outstandingBalance / installments;
  
  // Record agreement
  await updateInvoice(invoiceId, {
    paymentPlan: {
      installments: installments,
      amountPerInstallment: perInstallment,
      startDate: new Date(),
      status: 'active'
    }
  });
  
  // Schedule reminders
  for (let i = 1; i <= installments; i++) {
    await schedulePaymentReminder(invoiceId, i, perInstallment);
  }
};
```

---

## API Reference

### Endpoints

| Endpoint | Method | Description | Access |
|----------|--------|-------------|--------|
| `/api/invoices` | GET | List invoices | Accountant, Doctor |
| `/api/invoices` | POST | Create invoice | Accountant, Receptionist |
| `/api/invoices/:id` | GET | Get invoice details | Accountant, Doctor |
| `/api/invoices/:id` | PUT | Update invoice | Accountant |
| `/api/invoices/:id` | DELETE | Void invoice | Admin, Accountant |
| `/api/invoices/:id/payment` | POST | Record payment | Accountant, Receptionist |
| `/api/invoices/outstanding` | GET | Get outstanding invoices | Accountant |
| `/api/invoices/:id/print` | GET | Print receipt/invoice | All staff |

### Query Parameters

**GET /api/invoices**:
- `patientId`: Filter by patient
- `visitId`: Filter by visit
- `status`: Filter by status (`unpaid`, `partial`, `paid`)
- `startDate`, `endDate`: Date range

---

## UI Components

### InvoicesPageClient

**File**: `components/InvoicesPageClient.tsx`

Features:
- List all invoices with filters
- Status badges
- Outstanding balance highlighting
- Quick payment recording
- Search by patient/invoice number

### InvoiceForm

**File**: `components/InvoiceForm.tsx`

Features:
- Add/remove line items
- Auto-calculate totals
- Apply discounts
- Professional fee entry
- Service catalog integration

### InvoiceDetailClient

**File**: `components/InvoiceDetailClient.tsx`

Features:
- Full invoice details
- Payment history
- Record new payments
- Print receipt
- Void/refund handling

---

## Best Practices

### 1. Invoice Creation

✅ **Do**:
- Create invoice after consultation
- Include all services provided
- Verify prices with service catalog
- Document professional fees separately
- Generate invoice number automatically

❌ **Don't**:
- Create invoice without services
- Manually assign invoice numbers
- Mix facility and professional fees

### 2. Discount Application

✅ **Do**:
- Verify discount eligibility (ID check)
- Document discount reason
- Track who applied discount
- Follow legal requirements (PWD/Senior 20%)
- Apply discounts before payment

❌ **Don't**:
- Give unauthorized discounts
- Skip documentation
- Apply multiple conflicting discounts

### 3. Payment Recording

✅ **Do**:
- Issue official receipts
- Record payment method accurately
- Store reference numbers
- Update balance immediately
- Handle partial payments correctly

❌ **Don't**:
- Accept payment without documentation
- Forget to update invoice status
- Mix payments from different patients

### 4. Insurance Claims

✅ **Do**:
- Verify coverage before service
- Submit claims promptly
- Track claim status
- Follow up on pending claims
- Document all correspondence

❌ **Don't**:
- Assume full coverage
- Skip verification
- Lose claim numbers

### 5. Data Accuracy

```typescript
// Good: Automatic calculation
const calculateTotal = (items, discounts, tax) => {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
  const taxAmount = (subtotal - discountTotal) * (tax / 100);
  return subtotal - discountTotal + taxAmount;
};

// Bad: Manual entry prone to errors
const total = 1500; // Manually entered
```

---

## Common Workflows

### 1. Post-Consultation Billing

```typescript
// After consultation completed

// 1. Create invoice from visit
const invoice = await createInvoice({
  patient: visit.patient,
  visit: visit._id,
  items: [
    { description: 'Consultation Fee', unitPrice: 500, quantity: 1, total: 500 },
    { description: 'CBC Test', unitPrice: 350, quantity: 1, total: 350 }
  ],
  professionalFee: 400,
  professionalFeeDoctor: visit.doctor,
  subtotal: 850,
  total: 1250
});

// 2. Apply discount if applicable
if (patient.isSeniorCitizen) {
  await applySeniorDiscount(invoice._id, 1250);
}

// 3. Process payment
await recordPayment(invoice._id, {
  method: 'cash',
  amount: invoice.total
});

// 4. Print receipt
await printReceipt(invoice._id);
```

### 2. Insurance Claim Processing

```typescript
// Patient with HMO

// 1. Verify HMO coverage
const coverage = await verifyHMOCoverage(patient.hmo);

// 2. Create invoice
const invoice = await createInvoice({ ... });

// 3. Apply HMO coverage
await processHMOClaim(invoice._id, {
  provider: patient.hmo.provider,
  coverageType: 'partial',
  coverageAmount: 800
});

// 4. Patient pays co-pay
await recordPayment(invoice._id, {
  method: 'cash',
  amount: invoice.total - 800,
  notes: 'Patient co-pay'
});

// 5. Submit claim to HMO
await submitClaimToHMO(invoice);
```

---

**Last Updated**: February 14, 2026  
**Version**: 1.0.0
