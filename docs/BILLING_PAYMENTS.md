# Billing and Payments

Complete guide to managing invoices, payments, and financial transactions in MyClinicSoft.

## Overview

The Billing and Payments system provides comprehensive financial management including:
- Invoice generation
- Payment processing
- Outstanding balance tracking
- Payment plans
- Insurance claims
- Financial reports
- Receipt generation

## Accessing Billing

Navigate to **Billing** from the main menu.

**View Options:**
- All invoices
- Unpaid invoices
- Paid invoices
- Overdue invoices
- By date range
- By patient

## Creating an Invoice

### From Patient Visit

**Automatic Invoice Creation:**

After a clinical visit:
1. Click **Create Invoice** from visit page
2. System auto-populates:
   - Patient information
   - Consultation fee
   - Services provided
   - Date of service
3. Review and add additional items
4. Save invoice

### Manual Invoice Creation

1. Go to **Billing** → **New Invoice**
2. Fill in invoice details:

#### Patient Information
- **Select Patient*** (required)
  - Search by name or ID
  - Patient details auto-fill
  - Shows outstanding balance (if any)

#### Invoice Details
- **Invoice Date*** (required)
  - Defaults to today
  - Can backdate if needed
- **Due Date**
  - Default: Immediate (due on receipt)
  - Custom: 15 days, 30 days, etc.
- **Invoice Number**
  - Auto-generated
  - Format: INV-2024-00123
  - Can customize in settings

#### Line Items

Add services, medications, and procedures:

**Adding Services:**
1. Click **Add Line Item**
2. Select type:
   - **Service** - From services catalog
   - **Medication** - From inventory
   - **Custom** - Manual entry
   - **Lab Test** - From lab orders
   - **Procedure** - From procedure list

3. For each item:
   - Description
   - Quantity
   - Unit Price
   - Discount (if applicable)
   - Tax (if applicable)
   - Total (auto-calculated)

**Example Line Items:**
```
Description                  Qty    Unit Price    Total
------------------------------------------------
New Patient Consultation      1     ₱1,500.00    ₱1,500.00
Ibuprofen 400mg             28         ₱10.00      ₱280.00
Complete Blood Count          1       ₱400.00      ₱400.00
------------------------------------------------
                           Subtotal:            ₱2,180.00
                          Tax (12%):              ₱261.60
                              Total:            ₱2,441.60
```

4. Add notes (optional):
   - Payment instructions
   - Special terms
   - Thank you message

5. Click **Save Invoice**

## Invoice Status

### Status Types

- **Draft** - Not finalized, can be edited
- **Unpaid** - Sent to patient, payment pending
- **Partially Paid** - Some payment received
- **Paid** - Fully paid
- **Overdue** - Past due date, not paid
- **Cancelled** - Invoice cancelled
- **Refunded** - Payment refunded

### Status Workflow

```
Draft → Unpaid → Paid
         ↓
      Overdue → Paid
         ↓
    Partially Paid → Paid
```

## Recording Payments

### Full Payment

1. Open invoice
2. Click **Record Payment**
3. Enter payment details:
   - **Amount*** (required) - Pre-filled with balance
   - **Payment Date*** - Defaults to today
   - **Payment Method*** - Select method:
     - Cash
     - Credit/Debit Card
     - Bank Transfer
     - Check
     - Insurance
     - Other
   - **Reference Number** - For card/check/transfer
   - **Notes** - Additional information
4. Click **Save Payment**

**System Actions:**
- Updates invoice status to "Paid"
- Updates patient balance
- Generates official receipt
- Sends payment confirmation (SMS/Email)
- Records transaction in audit log

### Partial Payment

When patient pays less than full amount:

1. Open invoice
2. Click **Record Payment**
3. Enter partial amount
   - Example: ₱1,000 on ₱2,441.60 invoice
4. Save payment

**System Actions:**
- Invoice status: "Partially Paid"
- Remaining balance: ₱1,441.60
- Records payment
- Generates receipt for amount paid
- Patient can pay remainder later

**Multiple Partial Payments:**
- Record each payment separately
- System tracks all payments
- Shows payment history
- Auto-marks as "Paid" when fully paid

### Split Payment

When patient uses multiple payment methods:

Example: ₱1,500 cash + ₱941.60 card

1. Record first payment (₱1,500 cash)
2. Record second payment (₱941.60 card)
3. System combines both
4. Invoice marked as "Paid"

## Payment Methods

### Cash

**Recording:**
1. Select "Cash"
2. Enter amount
3. No reference number needed
4. Generate receipt

**Cash Handling:**
- Count cash carefully
- Give change if needed
- Issue official receipt
- Balance cash drawer at end of day

### Credit/Debit Card

**Recording:**
1. Select "Credit Card" or "Debit Card"
2. Process card payment (POS terminal)
3. Enter:
   - Last 4 digits of card
   - Approval code
   - Reference number
4. Attach card receipt (optional)
5. Save payment

**Card Processing:**
- Use integrated POS terminal
- Or manual card processing
- Record transaction details
- Keep card receipts for reconciliation

### Bank Transfer

**Recording:**
1. Patient transfers to clinic bank account
2. Verify transfer received
3. Select "Bank Transfer"
4. Enter:
   - Transfer reference number
   - Bank name
   - Date of transfer
5. Attach proof of transfer (optional)
6. Save payment

**Bank Reconciliation:**
- Check bank account daily
- Match transfers to invoices
- Record payments promptly
- Keep transfer records

### Check

**Recording:**
1. Receive check from patient
2. Verify check details
3. Select "Check"
4. Enter:
   - Check number
   - Bank name
   - Check date
   - Amount
5. Save payment

**Check Handling:**
- Verify check details
- Photocopy/scan check
- Deposit promptly
- Track check clearance
- Mark as "Pending Clearance" if needed

**Bounced Checks:**
1. Update payment status: "Failed"
2. Invoice returns to "Unpaid"
3. Add returned check fee (if applicable)
4. Contact patient

### Insurance

**Insurance Claims:**

1. Verify insurance coverage
2. Get pre-authorization (if required)
3. Create invoice
4. Select "Insurance"
5. Enter insurance details:
   - Insurance provider
   - Policy number
   - Authorization number
   - Coverage amount
6. Submit claim

**Claim Status:**
- Pending Approval
- Approved
- Partially Approved
- Denied

**Patient Co-Payment:**
1. Calculate patient responsibility:
   - Total: ₱2,441.60
   - Insurance covers: ₱1,941.60 (80%)
   - Patient co-pay: ₱500.00
2. Record co-pay as separate payment
3. Wait for insurance payment
4. Record insurance payment when received

**Denied Claims:**
1. Contact insurance company
2. Resubmit with additional info
3. Or bill patient for full amount
4. Update invoice accordingly

## Outstanding Balances

### Viewing Outstanding Balances

**Patient Balance:**
- View on patient detail page
- Shows total unpaid amount
- Lists all unpaid invoices
- Payment history

**All Outstanding:**
1. Go to **Billing** → **Unpaid**
2. See all patients with balances
3. Sort by:
   - Amount (highest first)
   - Date (oldest first)
   - Patient name

**Overdue Balances:**
- Filter by "Overdue"
- Past due date
- Highlighted in red
- Priority for follow-up

### Payment Reminders

**Automatic Reminders:**

System sends reminders based on settings:

**Schedule:**
- 7 days overdue: First reminder
- 14 days overdue: Second reminder
- 30 days overdue: Final notice

**Reminder Content:**
- Patient name
- Invoice number
- Amount due
- Original due date
- Payment methods
- Clinic contact info

**Manual Reminders:**
1. Open invoice
2. Click **Send Reminder**
3. Choose method: SMS/Email
4. Edit message if needed
5. Send

### Payment Plans

For patients who cannot pay full amount:

**Creating Payment Plan:**
1. Open invoice
2. Click **Create Payment Plan**
3. Set terms:
   - Total amount: ₱2,441.60
   - Down payment: ₱500.00
   - Number of installments: 4
   - Frequency: Monthly
   - First payment date: Next month
4. Calculate installments:
   - Down payment: ₱500.00
   - 4 monthly payments: ₱485.40 each
5. Save payment plan

**Payment Plan Tracking:**
- Shows payment schedule
- Tracks which payments made
- Sends reminders before due date
- Marks installments as paid
- Calculates remaining balance

**Missed Payments:**
- System alerts on missed payment
- Send reminder to patient
- Update payment plan if needed
- Add late fees (if applicable)

## Receipts

### Official Receipt

Generated automatically when payment recorded:

**Receipt Contents:**
```
OFFICIAL RECEIPT
OR No: OR-2024-00789

[Clinic Logo and Details]
Clinic Name: YourClinic Medical Center
Address: 123 Main Street, City, Country
TIN: 123-456-789-000
Phone: +63 917 123 4567

------------------------------------------------
Patient: Maria Santos
Date: January 15, 2024
Invoice No: INV-2024-00123

DESCRIPTION                          AMOUNT
------------------------------------------------
New Patient Consultation            ₱1,500.00
Ibuprofen 400mg x28                   ₱280.00
Complete Blood Count                  ₱400.00
------------------------------------------------
                        Subtotal:   ₱2,180.00
                       Tax (12%):     ₱261.60
------------------------------------------------
                           TOTAL:   ₱2,441.60

Payment Method: Cash
Amount Paid: ₱2,441.60
Change: ₱0.00

Received by: [Staff Name]
[Digital Signature]

------------------------------------------------
This serves as your official receipt.
Thank you for choosing YourClinic!
```

**Receipt Actions:**
- Print receipt
- Email to patient
- Send via SMS (link)
- Download PDF
- Add to patient portal

### Receipt Numbering

**Format:**
- OR-YYYY-NNNNN
- Example: OR-2024-00001
- Sequential numbering
- Cannot skip numbers
- For tax compliance

**Series Management:**
- New series each year (optional)
- Backup receipt series
- Track voided receipts

## Discounts and Adjustments

### Applying Discounts

**Discount Types:**
- Senior Citizen (20% by law in PH)
- PWD (20% by law in PH)
- Healthcare Worker
- Loyalty Program
- Promotional
- Staff/Family
- Custom

**How to Apply:**
1. During invoice creation
2. Add line items first
3. Click **Add Discount**
4. Select discount type
5. Enter:
   - Percentage or fixed amount
   - Reason
   - ID number (for senior/PWD)
6. System recalculates total

**Example with Senior Citizen Discount:**
```
Subtotal:                           ₱2,180.00
Tax:                                  ₱261.60
Total before discount:              ₱2,441.60
Senior Citizen Discount (20%):       -₱488.32
------------------------------------------------
TOTAL:                              ₱1,953.28
```

**Discount Documentation:**
- Copy ID
- Get signature
- Attach to invoice
- For audit compliance

### Invoice Adjustments

For corrections or changes:

1. Open invoice
2. Click **Adjust Invoice**
3. Make changes:
   - Add/remove items
   - Change quantities
   - Update prices
   - Add discount
4. Add reason for adjustment
5. Save adjustment

**Adjustment Types:**
- Credit - Reduce amount owed
- Debit - Increase amount owed
- Correction - Fix error

**After Adjustment:**
- Original invoice preserved
- Adjustment logged
- New total calculated
- Patient notified if needed
- Receipt regenerated

## Refunds

### Processing Refunds

When patient needs refund:

1. Open paid invoice
2. Click **Process Refund**
3. Enter details:
   - Refund amount (full or partial)
   - Reason:
     - Overpayment
     - Service not provided
     - Error in billing
     - Other
   - Refund method:
     - Cash
     - Card reversal
     - Bank transfer
     - Check
   - Date of refund
4. Click **Process Refund**

**System Actions:**
- Updates invoice status
- Adjusts patient balance
- Records refund transaction
- Generates refund receipt
- Updates financial reports

**Refund Receipt:**
```
REFUND RECEIPT
Refund No: REF-2024-00045

Original Invoice: INV-2024-00123
Original Amount: ₱2,441.60
Refund Amount: ₱2,441.60

Reason: Service cancelled
Refund Method: Bank Transfer
Date: January 16, 2024

Processed by: [Staff Name]
```

## Financial Reports

### Available Reports

Navigate to **Reports** → **Financial**

**Invoice Reports:**
- Invoice summary by date range
- Revenue by service type
- Revenue by doctor
- Payment method breakdown
- Tax report
- Discount summary

**Collection Reports:**
- Collected vs. outstanding
- Collection rate
- Average days to payment
- Overdue accounts
- Payment plan status

**Patient Reports:**
- Patient balances
- Top paying patients
- Patients with outstanding balance
- Payment history by patient

**Export Options:**
- PDF
- Excel
- CSV
- Print

### Key Metrics

**Dashboard Metrics:**
- Today's revenue
- This month's revenue
- Outstanding balance (total)
- Overdue amount
- Collection rate
- Average invoice amount

**Trends:**
- Revenue over time (chart)
- Payment methods used
- Services most billed
- Peak billing times

## Integration with Other Features

### From Clinical Visit

- Create invoice directly from visit
- Auto-include consultation fee
- Add procedures performed
- Link to visit record

### From Prescriptions

- Add medications to invoice
- Pull from prescription
- Auto-calculate quantities
- Deduct from inventory

### From Lab Orders

- Add lab tests to invoice
- Pull from lab order
- Include all tests ordered
- Link to lab results

### From Inventory

- Medications auto-deduct from stock
- Check stock availability
- Update inventory records
- Track medication sales

## Tips for Efficient Billing

1. **Bill Immediately** - Create invoice while patient present
2. **Collect at Time of Service** - Fewer outstanding balances
3. **Verify Insurance** - Check coverage before service
4. **Accurate Coding** - Use correct service codes
5. **Clear Communication** - Explain charges to patients
6. **Payment Options** - Offer multiple payment methods
7. **Payment Plans** - Work with patients on large balances
8. **Regular Follow-up** - Chase overdue accounts promptly
9. **Reconcile Daily** - Balance at end of each day
10. **Review Reports** - Weekly financial review

## Troubleshooting

### Payment Not Recording

**Check:**
- All required fields filled
- Amount is valid
- Payment date is valid
- Internet connection
- Permissions

**Solution:**
- Refresh page
- Re-enter payment
- Check browser console
- Contact support

### Invoice Total Incorrect

**Check:**
- Line item calculations
- Tax settings
- Discount applied correctly
- Rounding settings

**Solution:**
- Recalculate manually
- Check settings
- Adjust if needed
- Document correction

### Cannot Find Invoice

**Check:**
- Search by patient name
- Search by invoice number
- Check date range filter
- Check status filter

**Solution:**
- Clear all filters
- Search differently
- Check if deleted
- Check audit logs

## Best Practices

1. **Accurate Records** - Enter all charges correctly
2. **Timely Billing** - Invoice promptly after service
3. **Clear Descriptions** - Detailed line item descriptions
4. **Proper Documentation** - Keep all payment records
5. **Regular Reconciliation** - Daily cash/card reconciliation
6. **Follow-up System** - Systematic approach to collections
7. **Payment Policies** - Clear policies communicated to patients
8. **Staff Training** - Train all staff on billing procedures
9. **Audit Trail** - Maintain complete transaction history
10. **Compliance** - Follow tax and regulatory requirements

## Compliance

### Tax Compliance

**Requirements:**
- Issue official receipts (OR)
- Sequential OR numbering
- Record all transactions
- File tax returns
- Keep records for required period

**Tax Reports:**
- Monthly sales summary
- VAT collected
- Senior/PWD discounts
- Exempt transactions

### Financial Audit

**Preparation:**
- Complete transaction records
- All receipts filed
- Bank reconciliation done
- Discrepancy explanations
- Supporting documents ready

## Related Documentation

- [Patient Management](PATIENT_MANAGEMENT.md)
- [Clinical Visits](CLINICAL_VISITS.md)
- [Prescriptions](EPRESCRIPTION.md)
- [Inventory Management](INVENTORY_MANAGEMENT.md)
- [Reports and Analytics](DASHBOARD_REPORTING.md)
- [Settings](SETTINGS_CONFIGURATION.md)
