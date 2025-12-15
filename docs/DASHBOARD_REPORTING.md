# Dashboard & Reporting System

This document describes the Dashboard & Reporting features implemented in MyClinicSoft.

## Features Overview

### 1. Daily/Weekly/Monthly Consultations Report

Tracks and reports on patient consultations (visits) across different time periods.

**API Endpoint:** `GET /api/reports/consultations`

**Query Parameters:**
- `period` - Time period: `daily`, `weekly`, or `monthly` (default: `monthly`)
- `startDate` - Custom start date (YYYY-MM-DD)
- `endDate` - Custom end date (YYYY-MM-DD)

**Response Includes:**
- Total consultations count
- Breakdown by visit type
- Breakdown by status
- Breakdown by provider (doctor)
- Daily breakdown with counts

**Example:**
```javascript
GET /api/reports/consultations?period=monthly

Response:
{
  "success": true,
  "data": {
    "period": "monthly",
    "dateRange": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-31T23:59:59.999Z"
    },
    "summary": {
      "totalConsultations": 150,
      "byType": {
        "consultation": 120,
        "follow-up": 30
      },
      "byStatus": {
        "closed": 140,
        "open": 10
      },
      "byProvider": {
        "Dr. John Smith": 80,
        "Dr. Jane Doe": 70
      }
    },
    "dailyBreakdown": [...],
    "generatedAt": "2024-01-31T12:00:00.000Z"
  }
}
```

### 2. Income Reports

Comprehensive financial reporting with revenue, payments, and outstanding balances.

**API Endpoint:** `GET /api/reports/income`

**Access:** Admin and Accountant only

**Query Parameters:**
- `period` - Time period: `daily`, `weekly`, or `monthly` (default: `monthly`)
- `startDate` - Custom start date (YYYY-MM-DD)
- `endDate` - Custom end date (YYYY-MM-DD)

**Response Includes:**
- Total billed amount
- Total paid amount
- Total outstanding balance
- Total discounts applied
- Total tax
- Breakdown by payment method (cash, GCash, bank transfer, etc.)
- Breakdown by invoice status
- Breakdown by service category
- Daily revenue breakdown
- Average daily revenue

**Example:**
```javascript
GET /api/reports/income?period=monthly

Response:
{
  "success": true,
  "data": {
    "period": "monthly",
    "summary": {
      "totalBilled": 500000,
      "totalPaid": 450000,
      "totalOutstanding": 50000,
      "totalDiscounts": 10000,
      "totalTax": 5000,
      "invoiceCount": 200,
      "paidInvoiceCount": 180,
      "avgDailyRevenue": 14516.13
    },
    "breakdowns": {
      "byPaymentMethod": {
        "cash": 300000,
        "gcash": 100000,
        "bank_transfer": 50000
      },
      "byStatus": {
        "paid": 180,
        "partial": 15,
        "unpaid": 5
      },
      "byCategory": {
        "consultation": 200000,
        "procedure": 150000,
        "lab": 100000
      }
    },
    "dailyBreakdown": [...]
  }
}
```

### 3. HMO Backlogs and Claims Report

Tracks insurance/HMO claims, backlogs, and claim status.

**API Endpoint:** `GET /api/reports/hmo-claims`

**Access:** Admin and Accountant only

**Query Parameters:**
- `provider` - Filter by HMO/insurance provider name
- `status` - Filter by claim status: `pending`, `approved`, `rejected`, `paid`

**Response Includes:**
- Total claims count and amount
- Claims by status (pending, approved, rejected, paid)
- Backlog count and amount (pending + approved but not paid)
- Average days pending for claims
- Breakdown by provider
- Claims with age (days since creation)
- Detailed claim information

**Example:**
```javascript
GET /api/reports/hmo-claims

Response:
{
  "success": true,
  "data": {
    "summary": {
      "totalClaims": 50,
      "totalClaimAmount": 200000,
      "pendingClaims": 20,
      "approvedClaims": 15,
      "rejectedClaims": 5,
      "paidClaims": 10,
      "backlogCount": 35,
      "backlogAmount": 140000,
      "avgDaysPending": 12.5
    },
    "byProvider": [
      {
        "provider": "PhilHealth",
        "totalClaims": 30,
        "totalAmount": 120000,
        "byStatus": {
          "pending": 10,
          "approved": 10,
          "paid": 10
        },
        "claims": [...]
      }
    ],
    "byStatus": {...},
    "claimsWithAge": [...]
  }
}
```

### 4. Inventory Reports

Comprehensive inventory management and reporting.

**API Endpoint:** `GET /api/reports/inventory`

**Access:** Admin only

**Query Parameters:**
- `category` - Filter by category: `medicine`, `supply`, `equipment`, `other`
- `status` - Filter by status: `in-stock`, `low-stock`, `out-of-stock`, `expired`

**Response Includes:**
- Total items count
- Total inventory value
- Breakdown by status
- Breakdown by category
- Low stock items (needs reordering)
- Expired items
- Items expiring soon (within 30 days)
- Category value breakdown
- Top items by value

**Inventory Model Features:**
- Automatic status calculation (in-stock, low-stock, out-of-stock, expired)
- Reorder level tracking
- Expiry date tracking
- Supplier information
- Storage location
- Cost tracking

**Example:**
```javascript
GET /api/reports/inventory?status=low-stock

Response:
{
  "success": true,
  "data": {
    "summary": {
      "totalItems": 500,
      "totalValue": 500000,
      "byStatus": {
        "in-stock": 400,
        "low-stock": 80,
        "out-of-stock": 15,
        "expired": 5
      },
      "byCategory": {
        "medicine": 300,
        "supply": 150,
        "equipment": 50
      },
      "lowStockCount": 95,
      "expiredCount": 5,
      "expiringSoonCount": 10
    },
    "lowStockItems": [
      {
        "name": "Paracetamol 500mg",
        "quantity": 5,
        "reorderLevel": 20,
        "reorderQuantity": 100,
        "unit": "boxes"
      }
    ],
    "expiredItems": [...],
    "expiringSoon": [...],
    "categoryValue": {
      "medicine": 300000,
      "supply": 150000,
      "equipment": 50000
    },
    "topItemsByValue": [...]
  }
}
```

### 5. Patient Demographics Report

Comprehensive patient demographic analysis.

**API Endpoint:** `GET /api/reports/demographics`

**Access:** Admin only

**Response Includes:**
- Total patients count
- Age group distribution (0-12, 13-17, 18-25, 26-35, 36-45, 46-55, 56-65, 66+)
- Gender distribution
- Civil status breakdown
- Location (city) distribution
- Nationality distribution
- Patients with pre-existing conditions
- Patients with allergies
- Patients with insurance
- Discount eligibility (PWD, Senior, Membership)
- Top cities by patient count

**Example:**
```javascript
GET /api/reports/demographics

Response:
{
  "success": true,
  "data": {
    "summary": {
      "totalPatients": 1000,
      "withConditions": 300,
      "withAllergies": 200,
      "withInsurance": 500
    },
    "demographics": {
      "ageGroups": {
        "0-12": 50,
        "13-17": 80,
        "18-25": 150,
        "26-35": 200,
        "36-45": 180,
        "46-55": 150,
        "56-65": 100,
        "66+": 90
      },
      "byGender": {
        "male": 480,
        "female": 520
      },
      "byCivilStatus": {
        "single": 400,
        "married": 500,
        "widowed": 100
      },
      "byCity": {
        "Manila": 300,
        "Quezon City": 250,
        "Makati": 200
      },
      "byNationality": {
        "Filipino": 950,
        "American": 30,
        "Other": 20
      }
    },
    "discountEligibility": {
      "pwd": 50,
      "senior": 150,
      "membership": 100
    },
    "topCities": [...]
  }
}
```

### 6. Dashboard Summary

Quick overview dashboard with key metrics and recent activities.

**API Endpoint:** `GET /api/reports/dashboard`

**Query Parameters:**
- `period` - Time period: `today`, `week`, or `month` (default: `today`)

**Response Includes:**
- Total patients
- Total active doctors
- Today's appointments
- Period appointments and visits
- Period revenue and billing
- Total outstanding balance
- Recent appointments (today)
- Upcoming appointments (next 7 days)
- Payment method breakdown

**Example:**
```javascript
GET /api/reports/dashboard?period=week

Response:
{
  "success": true,
  "data": {
    "period": "week",
    "overview": {
      "totalPatients": 1000,
      "totalDoctors": 10,
      "todayAppointments": 25,
      "periodAppointments": 150,
      "periodVisits": 140,
      "periodRevenue": 50000,
      "periodBilled": 55000,
      "totalOutstanding": 5000,
      "outstandingInvoiceCount": 10
    },
    "recentAppointments": [...],
    "upcomingAppointments": [...],
    "paymentMethodBreakdown": {
      "cash": 30000,
      "gcash": 15000,
      "bank_transfer": 5000
    }
  }
}
```

## Inventory Management API

### Inventory CRUD Operations

**Endpoints:**
- `GET /api/inventory` - List all inventory items
  - Query params: `category`, `status`, `lowStock`
- `POST /api/inventory` - Create new inventory item (admin only)
- `GET /api/inventory/[id]` - Get inventory item details
- `PUT /api/inventory/[id]` - Update inventory item (admin only)
- `DELETE /api/inventory/[id]` - Delete inventory item (admin only)

**Inventory Item Model:**
```typescript
{
  medicineId: ObjectId,      // Optional link to Medicine
  name: string,              // Item name
  category: string,          // medicine, supply, equipment, other
  sku: string,              // Stock Keeping Unit
  quantity: number,         // Current quantity
  unit: string,            // pieces, boxes, bottles, etc.
  reorderLevel: number,    // Minimum before reordering
  reorderQuantity: number, // Quantity to order
  unitCost: number,        // Cost per unit
  supplier: string,        // Supplier name
  expiryDate: Date,        // For medicines
  location: string,         // Storage location
  status: string,          // Auto-calculated: in-stock, low-stock, out-of-stock, expired
  lastRestocked: Date,     // Last restock date
  lastRestockedBy: ObjectId // User who restocked
}
```

**Automatic Status Calculation:**
- Status is automatically calculated based on:
  - Expiry date (if expired → `expired`)
  - Quantity = 0 → `out-of-stock`
  - Quantity ≤ reorderLevel → `low-stock`
  - Otherwise → `in-stock`

## Usage Examples

### Get Monthly Consultations Report

```javascript
const response = await fetch('/api/reports/consultations?period=monthly');
const data = await response.json();
console.log(`Total consultations: ${data.data.summary.totalConsultations}`);
```

### Get Income Report for Custom Date Range

```javascript
const response = await fetch(
  '/api/reports/income?startDate=2024-01-01&endDate=2024-01-31'
);
const data = await response.json();
console.log(`Total revenue: ${data.data.summary.totalPaid}`);
```

### Get HMO Backlog Report

```javascript
const response = await fetch('/api/reports/hmo-claims?status=pending');
const data = await response.json();
console.log(`Backlog amount: ${data.data.summary.backlogAmount}`);
```

### Get Low Stock Items

```javascript
const response = await fetch('/api/reports/inventory?status=low-stock');
const data = await response.json();
data.data.lowStockItems.forEach(item => {
  console.log(`${item.name}: ${item.quantity} ${item.unit} (reorder at ${item.reorderLevel})`);
});
```

### Get Patient Demographics

```javascript
const response = await fetch('/api/reports/demographics');
const data = await response.json();
console.log(`Age distribution:`, data.data.demographics.ageGroups);
```

### Get Dashboard Summary

```javascript
const response = await fetch('/api/reports/dashboard?period=week');
const data = await response.json();
console.log(`Today's appointments: ${data.data.overview.todayAppointments}`);
```

## Access Control

- **Consultations Report**: All authenticated users
- **Income Report**: Admin and Accountant only
- **HMO Claims Report**: Admin and Accountant only
- **Inventory Report**: Admin only
- **Demographics Report**: Admin only
- **Dashboard**: All authenticated users

## Future Enhancements

- Export reports to PDF/Excel
- Scheduled report generation
- Custom report builder
- Report templates
- Email report delivery
- Interactive charts and graphs
- Comparative reports (period over period)
- Trend analysis
- Predictive analytics
- Inventory alerts and notifications
- Automated reorder suggestions
- Supplier management
- Purchase order tracking

