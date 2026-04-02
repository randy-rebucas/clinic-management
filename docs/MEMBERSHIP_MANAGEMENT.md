# Membership Management

The Memberships module lets you create loyalty or discount programs for patients. Members receive automatic discounts on invoices when their membership is active.

---

## Accessing Memberships

Go to **Memberships** in the sidebar.

> **Access:** Admin role required to create and manage membership plans. Receptionists can view memberships and assign them to patients.

---

## How Memberships Work

1. An admin creates a **Membership Plan** with a discount percentage and validity dates.
2. A receptionist or admin assigns the plan to a **Patient** on their profile.
3. When an invoice is created for that patient, the membership discount is applied automatically.

---

## Creating a Membership Plan

1. Go to **Memberships → New Membership**.
2. Fill in the form:

| Field | Description |
|---|---|
| **Name** | Plan name (e.g., "Gold Member", "Annual Card") |
| **Discount Percentage** | Discount applied to invoices (e.g., 10 for 10%) |
| **Valid From** | Start date of the plan's validity |
| **Valid To** | Expiry date of the plan |
| **Description** | Details about benefits or terms |
| **Active** | Toggle to enable or disable the plan |

3. Click **Save**.

---

## Assigning a Membership to a Patient

1. Go to the **Patient Profile**.
2. Click **Edit**.
3. In the **Membership** field, select the membership plan from the dropdown.
4. Click **Save**.

The membership discount will now be available on all future invoices for this patient while the plan is active.

---

## Membership Discount on Invoices

When creating an invoice for a patient with an active membership:

1. The membership discount is shown in the **Discount** section of the invoice form.
2. The discount percentage is applied automatically to the subtotal.
3. The final total reflects the deducted amount.

> If a patient also qualifies for a PWD or Senior Citizen discount, only the highest applicable discount is used.

---

## Managing Existing Memberships

### Editing a Plan
1. Click the membership plan in the list.
2. Click **Edit**.
3. Update the fields and click **Save**.

Changes to the discount percentage apply to all future invoices. Existing invoices are not retroactively updated.

### Deactivating a Plan
1. Open the membership plan.
2. Click **Edit**.
3. Toggle **Active** to off.
4. Save.

Deactivated plans are no longer available for assignment to new patients. Patients already assigned will retain the plan on their profile but will not receive the discount until the plan is reactivated or a new active plan is assigned.

---

## Viewing Members

Click a membership plan to open its detail page. The **Members** tab shows all patients currently assigned to this plan.

---

## Membership Expiry

Membership plans have a **Valid From** and **Valid To** date. After the expiry date:
- The discount is no longer applied to new invoices.
- The patient's profile still shows the membership, but it is flagged as expired.

To renew, create a new membership plan with updated dates and reassign it to the relevant patients.

---

## Tips

- Name membership plans clearly so staff can easily identify them during patient registration (e.g., "2025 Annual Discount Card").
- Use the **Description** field to explain the benefits and any terms, so staff can answer patient questions accurately.
- Consider setting a calendar reminder to create updated plans before existing ones expire.
