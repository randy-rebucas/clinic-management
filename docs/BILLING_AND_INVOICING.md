# Billing and Invoicing

The Invoicing module handles all billing for patient services. It supports multi-item invoices, discount categories (PWD, senior, membership), and payment tracking.

---

## Accessing Invoices

Go to **Invoices** in the sidebar. The list shows all invoices with search and filter controls.

### Filtering

| Filter | Description |
|---|---|
| **Search** | Search by patient name or invoice number |
| **Status** | Filter by payment status |
| **Date range** | Filter by invoice date |

---

## Invoice Statuses

| Status | Meaning |
|---|---|
| **Draft** | Created but not yet sent to the patient |
| **Issued** | Sent to the patient for payment |
| **Paid** | Fully paid |
| **Partially Paid** | Payment received but balance remains |
| **Overdue** | Past the due date with an unpaid balance |
| **Cancelled** | Invoice was voided |

---

## Creating an Invoice

### From a Visit (Recommended)

1. Open the patient's **Visit** record.
2. Click **New Invoice**.
3. The invoice is pre-linked to the visit and the patient is already selected.

### Standalone

1. Go to **Invoices → New Invoice**.
2. Search for and select the **Patient**.

---

## Invoice Form

### Header

| Field | Description |
|---|---|
| **Patient** | Required — the billed patient |
| **Visit** | Link to a clinical visit (optional) |
| **Invoice Date** | Defaults to today |
| **Due Date** | Payment deadline |

### Line Items

Click **Add Item** to add each service or product billed.

| Field | Description |
|---|---|
| **Service** | Select from the clinic's services list (autocomplete) |
| **Description** | Override or add detail to the service name |
| **Quantity** | Number of units |
| **Unit Price** | Price per unit (auto-filled from the service definition) |
| **Amount** | Calculated automatically (quantity × unit price) |

Repeat for each billable item. Click the **×** on a row to remove it.

### Discount Application

Discounts are applied after line items are entered.

| Discount Type | How to Apply |
|---|---|
| **PWD Discount** | Enable the PWD toggle — the discount rate from Settings is applied |
| **Senior Citizen Discount** | Enable the Senior toggle — the discount rate from Settings is applied |
| **Membership Discount** | If the patient has an active membership, it is applied automatically |

> Discount eligibility is set on the **Patient Profile**. Only patients marked as PWD-eligible or senior-eligible will show these options.

Only one discount category applies at a time (the highest discount takes precedence if multiple apply).

### Totals

| Field | Description |
|---|---|
| **Subtotal** | Sum of all line items before discount |
| **Discount Amount** | Amount deducted based on the discount type and rate |
| **Tax / VAT** | If configured in Settings, tax is calculated here |
| **Total** | Final amount due |

### Notes

Use the **Notes** field for payment instructions, insurance information, or any other message to appear on the printed invoice.

Click **Save** to create the invoice.

---

## Recording a Payment

1. Open an invoice with an **Issued**, **Partially Paid**, or **Overdue** status.
2. Click **Record Payment**.
3. Fill in the payment details:

| Field | Description |
|---|---|
| **Amount** | Amount being paid now |
| **Payment Method** | Cash, Card, Bank Transfer, HMO / Insurance, etc. |
| **Payment Date** | Defaults to today |
| **Reference No.** | Optional — receipt or transaction reference number |

4. Click **Save Payment**.

The invoice status updates automatically:
- If the paid amount equals the total → **Paid**
- If the paid amount is less than the total → **Partially Paid**

---

## Printing an Invoice / Receipt

1. Open the invoice.
2. Click **Print Invoice** to generate the full invoice document.
3. Click **Print Receipt** to generate a payment receipt (available after a payment is recorded).

Both documents include clinic letterhead, patient details, itemized charges, and totals.

---

## Outstanding Balance Report

From the **Dashboard** (Admin / Accountant view) or the **Reports** section, you can see:
- Total outstanding invoices
- Per-patient outstanding balances

Go to **Patients → [Patient Name]** → **Invoices** tab to see all invoices and balances for a specific patient.

---

## Tips

- Set up your service list in **Services** before creating invoices so items can be selected quickly with autocomplete.
- The currency symbol and tax rate are configured in **Settings → Billing**.
- PWD and senior discount rates are set in **Settings → Billing** and apply globally.
- If a patient has both a membership discount and a senior discount, only the higher discount applies.
