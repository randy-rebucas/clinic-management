# Accountant Journey - Start to Finish

## Overview
This document outlines the complete accountant journey through MyClinicSoft, covering financial management, invoice processing, payment tracking, and financial reporting.

---

## Journey Flow Diagram

```
┌─────────────────┐
│ 1. ONBOARDING   │
│   & SETUP       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. VIEW         │
│   DASHBOARD     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. INVOICE      │
│   MANAGEMENT    │
└────────┬────────┘
         │
         ├──► 4. PAYMENT TRACKING
         ├──► 5. OUTSTANDING BALANCES
         │
         ▼
┌─────────────────┐
│ 6. FINANCIAL    │
│   REPORTS       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 7. DOCTOR       │
│   PRODUCTIVITY  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 8. RECONCILIATION│
│   & AUDIT       │
└─────────────────┘
```

---

## Detailed Journey Steps

### 1. Accountant Onboarding & Setup

**Entry Point:**
- Admin creates accountant profile via staff management

**Process:**
1. Admin creates `Accountant` record with:
   - Personal Information: firstName, lastName, email, phone
   - Professional Info: certification (CPA, CMA), licenseNumber
   - Employee ID
   - Department assignment
   - Hire date

2. System automatically:
   - Creates `User` account linked to accountant profile
   - Assigns 'accountant' role
   - Generates default password
   - Sets status: `'active'`

3. Accountant receives:
   - Login credentials
   - Account activation instructions
   - First-time login prompts password change

4. Initial setup:
   - Accountant logs in and changes password
   - Completes profile information
   - Reviews financial permissions
   - Familiarizes with billing system

**Models Involved:**
- `Accountant` - Accountant profile
- `User` - User account (auto-created)
- `Role` - Accountant role assignment

**Status:**
- `status: 'active'` | `'inactive'` | `'on-leave'`

**API Endpoints:**
- `POST /api/staff` (type: 'accountant') - Create accountant (admin only)
- `GET /api/staff?type=accountant` - List accountants
- `GET /api/staff/[id]` - Get accountant details
- `PUT /api/staff/[id]` - Update accountant profile

**Next Step:** View Dashboard

---

### 2. View Dashboard

**Process:**
1. Financial overview:
   - Total revenue
   - Outstanding balances
   - Today's revenue
   - Period revenue
   - Payment methods breakdown

2. Invoice summary:
   - Total invoices
   - Paid invoices
   - Unpaid invoices
   - Partial payments
   - Outstanding amount

3. Quick statistics:
   - Revenue trends
   - Payment trends
   - Outstanding trends
   - Period comparisons

4. Recent activity:
   - Recent invoices
   - Recent payments
   - Outstanding invoices
   - Payment alerts

**Models Involved:**
- `Invoice` - Invoice data
- `Patient` - Patient data (read-only)
- `Appointment` - Appointment data (read-only)

**API Endpoints:**
- `GET /api/reports/dashboard/role-based` - Accountant dashboard
- `GET /api/invoices` - List invoices
- `GET /api/invoices/outstanding` - Outstanding invoices

**Next Step:** Invoice Management

---

### 3. Invoice Management

**Process:**
1. View invoices:
   - List all invoices
   - Filter by status (unpaid, partial, paid)
   - Filter by date range
   - Filter by patient
   - Search invoices

2. Invoice details:
   - View invoice items
   - Check discounts applied
   - Review payment history
   - Verify totals
   - Check insurance/HMO status

3. Invoice operations:
   - Update invoice details
   - Add/remove items
   - Adjust discounts
   - Update totals
   - Modify status

4. Invoice validation:
   - Verify calculations
   - Check discount eligibility
   - Validate insurance claims
   - Ensure compliance

5. Invoice generation:
   - Generate invoice numbers
   - Create invoice documents
   - Print invoices
   - Email invoices

**Models Involved:**
- `Invoice` - Invoice records
- `Patient` - Patient reference
- `Visit` - Linked visit
- `Service` - Service catalog
- `Membership` - Membership discounts

**Status:**
- `status: 'unpaid'` → `'partial'` → `'paid'` → `'refunded'`

**API Endpoints:**
- `GET /api/invoices` - List invoices
- `GET /api/invoices/[id]` - Get invoice details
- `PUT /api/invoices/[id]` - Update invoice
- `GET /api/invoices/[id]/receipt` - Get receipt
- `GET /api/invoices/outstanding` - Outstanding invoices

**Next Steps:** Payment Tracking, Outstanding Balances

---

### 4. Payment Tracking

**Process:**
1. View payments:
   - All payments
   - Filter by date range
   - Filter by payment method
   - Filter by patient
   - Search payments

2. Payment details:
   - Payment amount
   - Payment method
   - Payment date
   - Receipt number
   - Reference number
   - Processed by

3. Payment verification:
   - Verify payment amounts
   - Check payment methods
   - Validate receipts
   - Confirm deposits

4. Payment reconciliation:
   - Match payments to invoices
   - Verify outstanding balances
   - Track partial payments
   - Monitor payment trends

5. Payment reporting:
   - Payment summaries
   - Payment method breakdown
   - Daily/weekly/monthly reports
   - Trends and analysis

**Models Involved:**
- `Invoice` - Invoice with payments
- `Patient` - Patient reference
- `User` - Payment processor

**API Endpoints:**
- `GET /api/invoices` - List invoices with payments
- `GET /api/invoices/[id]` - Get invoice with payment history
- `POST /api/invoices/[id]/payment` - Record payment (if needed)

**Next Step:** Outstanding Balances

---

### 5. Outstanding Balances Management

**Process:**
1. View outstanding invoices:
   - Unpaid invoices
   - Partially paid invoices
   - Overdue invoices
   - By patient
   - By amount

2. Outstanding analysis:
   - Total outstanding amount
   - Outstanding by patient
   - Outstanding by period
   - Aging analysis
   - Collection trends

3. Follow-up actions:
   - Send reminders
   - Contact patients
   - Schedule follow-ups
   - Update payment plans
   - Write off bad debts (if authorized)

4. Payment plans:
   - Create payment plans
   - Track installments
   - Monitor compliance
   - Update status

5. Collections:
   - Track collection efforts
   - Record collection notes
   - Update invoice status
   - Generate collection reports

**Models Involved:**
- `Invoice` - Outstanding invoices
- `Patient` - Patient reference
- `Notification` - Payment reminders

**API Endpoints:**
- `GET /api/invoices/outstanding` - Outstanding invoices
- `GET /api/invoices?status=unpaid` - Unpaid invoices
- `GET /api/invoices?status=partial` - Partially paid invoices
- `PUT /api/invoices/[id]` - Update invoice status

**Next Step:** Financial Reports

---

### 6. Financial Reports

**Process:**
1. Revenue reports:
   - Total revenue
   - Revenue by period
   - Revenue by service
   - Revenue by doctor
   - Revenue trends

2. Payment reports:
   - Payment summaries
   - Payment method breakdown
   - Payment trends
   - Collection rates

3. Outstanding reports:
   - Outstanding balances
   - Aging reports
   - Collection reports
   - Bad debt analysis

4. Period comparisons:
   - Daily comparisons
   - Weekly comparisons
   - Monthly comparisons
   - Year-over-year

5. Custom reports:
   - Date range reports
   - Patient-specific reports
   - Service-specific reports
   - Custom filters

6. Report export:
   - Export to Excel
   - Export to PDF
   - Email reports
   - Schedule reports

**Models Involved:**
- `Invoice` - Financial data
- `Patient` - Patient data
- `Service` - Service data
- `Doctor` - Doctor data

**API Endpoints:**
- `GET /api/reports/dashboard` - Financial dashboard
- `GET /api/reports/dashboard/role-based` - Accountant dashboard
- `GET /api/invoices` - Invoice reports with filters

**Next Step:** Doctor Productivity

---

### 7. Doctor Productivity Reports

**Process:**
1. View all doctors:
   - List active doctors
   - Doctor profiles
   - Specializations

2. Productivity metrics:
   - Total appointments
   - Completed appointments
   - Cancelled appointments
   - No-show rates
   - Completion rates

3. Revenue metrics:
   - Revenue per doctor
   - Revenue per visit
   - Total billed
   - Total collected
   - Outstanding revenue

4. Visit metrics:
   - Total visits
   - Completed visits
   - Visit types
   - Average visits per day

5. Prescription metrics:
   - Total prescriptions
   - Active prescriptions
   - Prescription trends

6. Comparative analysis:
   - Compare doctors
   - Performance rankings
   - Trend analysis
   - Period comparisons

**Models Involved:**
- `Doctor` - Doctor profiles
- `Appointment` - Appointment data
- `Visit` - Visit data
- `Prescription` - Prescription data
- `Invoice` - Revenue data

**API Endpoints:**
- `GET /api/doctors/productivity` - All doctors productivity
- `GET /api/doctors/[id]/productivity` - Specific doctor productivity
- `GET /api/doctors` - List doctors

**Next Step:** Reconciliation & Audit

---

### 8. Reconciliation & Audit

**Process:**
1. Daily reconciliation:
   - Match payments to invoices
   - Verify cash receipts
   - Check bank deposits
   - Reconcile discrepancies

2. Financial audit:
   - Review transactions
   - Verify calculations
   - Check for errors
   - Validate data integrity

3. Compliance checks:
   - Tax compliance
   - Financial reporting
   - Audit trail review
   - Data accuracy

4. Audit trail:
   - Review all financial transactions
   - Track changes to invoices
   - Monitor payment processing
   - Verify user actions

5. Reporting:
   - Financial statements
   - Tax reports
   - Compliance reports
   - Audit reports

**Models Involved:**
- `Invoice` - All invoices
- `AuditLog` - Audit trail
- `User` - User activity

**API Endpoints:**
- `GET /api/audit-logs` - Audit logs
- `GET /api/invoices` - All invoices for reconciliation
- `GET /api/reports` - Financial reports

---

## Key Features for Accountants

### Dashboard
- Financial overview
- Revenue summary
- Outstanding balances
- Payment trends
- Quick statistics

### Invoice Management
- Complete invoice CRUD
- Invoice validation
- Discount management
- Insurance/HMO tracking
- Invoice generation

### Payment Processing
- Payment tracking
- Payment verification
- Payment reconciliation
- Receipt generation
- Payment reporting

### Financial Reporting
- Revenue reports
- Payment reports
- Outstanding reports
- Period comparisons
- Custom reports

### Productivity Analysis
- Doctor productivity
- Revenue analysis
- Performance metrics
- Comparative reports

---

## Daily Workflow Summary

### Morning Routine
1. **Login** - Access accountant dashboard
2. **Review Dashboard** - Check financial overview
3. **Review Outstanding** - Check unpaid invoices
4. **Check Payments** - Review overnight payments

### During Day
1. **Invoice Management** - Review and update invoices
2. **Payment Tracking** - Track and verify payments
3. **Outstanding Follow-up** - Follow up on unpaid invoices
4. **Financial Reports** - Generate reports as needed
5. **Reconciliation** - Reconcile daily transactions

### End of Day
1. **Daily Reconciliation** - Reconcile all transactions
2. **Generate Reports** - Create daily reports
3. **Review Outstanding** - Check remaining balances
4. **Plan Next Day** - Schedule follow-ups

---

## Status Summary

### Accountant Status
- `active` - Available for duty
- `inactive` - Not available
- `on-leave` - On leave/vacation

### Invoice Status
- `unpaid` - No payment received
- `partial` - Partial payment received
- `paid` - Fully paid
- `refunded` - Payment refunded

---

## API Endpoint Summary

### Invoice Management
- `GET /api/invoices` - List invoices
- `GET /api/invoices/[id]` - Get invoice
- `PUT /api/invoices/[id]` - Update invoice
- `GET /api/invoices/outstanding` - Outstanding invoices
- `GET /api/invoices/[id]/receipt` - Get receipt

### Financial Reports
- `GET /api/reports/dashboard` - Main dashboard
- `GET /api/reports/dashboard/role-based` - Accountant dashboard
- `GET /api/doctors/productivity` - Doctor productivity

### Patient & Appointment (Read-only)
- `GET /api/patients` - List patients
- `GET /api/patients/[id]` - Get patient
- `GET /api/appointments` - List appointments

### Audit
- `GET /api/audit-logs` - Audit logs

---

## Best Practices

1. **Accuracy**: Ensure all financial data is accurate
2. **Reconciliation**: Reconcile daily transactions
3. **Documentation**: Document all financial activities
4. **Compliance**: Maintain tax and financial compliance
5. **Security**: Protect financial data (PH DPA compliance)
6. **Reporting**: Generate timely financial reports
7. **Follow-up**: Follow up on outstanding balances
8. **Audit Trail**: Maintain complete audit trail

---

*Last Updated: 2024*
*Version: 1.0*

