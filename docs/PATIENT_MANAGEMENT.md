# Patient Management

The Patients section is the central registry for all patient records. It stores demographic information, contact details, and discount eligibility, and links to every visit, prescription, invoice, and document associated with each patient.

---

## Accessing the Patient List

Go to **Patients** in the sidebar. The page displays all registered patients with search and filter controls at the top.

### Searching for a Patient

Type a name, email, phone number, or patient code in the **search bar**. Results update as you type.

### Filtering Patients

| Filter | Options |
|---|---|
| **Sex** | Male, Female, Other |
| **Active** | Active only, Inactive only, All |
| **Age Range** | Set minimum and/or maximum age |
| **City** | Filter by city of residence |
| **State / Province** | Filter by state or province |

### Sorting

Click the **Sort** control to order results by:
- Name A–Z or Z–A
- Date registered (newest or oldest first)
- Patient code

---

## Registering a New Patient

1. Click **New Patient** (top-right of the Patients page).
2. Fill in the patient details form.
3. Click **Save**.

### Required Fields

| Field | Description |
|---|---|
| **First Name** | Patient's given name |
| **Last Name** | Patient's family name |
| **Date of Birth** | Used to calculate age and eligibility |
| **Sex** | Male, Female, or Other |

### Optional Fields

| Field | Description |
|---|---|
| **Middle Name** | Optional middle name |
| **Email** | Patient's email address |
| **Phone** | Contact phone number |
| **Civil Status** | Single, Married, Widowed, etc. |
| **Address** | Street, city, state/province |
| **Active** | Toggle to mark the patient as active or inactive |

### Discount Eligibility

These fields unlock automatic discounts when billing this patient.

| Field | Description |
|---|---|
| **PWD Eligible** | Check if patient has a PWD (Persons with Disability) card; enter the PWD ID number |
| **Senior Citizen Eligible** | Check if patient qualifies for senior discounts; enter the Senior Citizen ID number |
| **Membership** | Assign an active membership plan to apply its discount percentage |

---

## Viewing a Patient Profile

Click any patient in the list to open their full profile. The profile page is organized into tabs:

| Tab | Contents |
|---|---|
| **Overview** | Summary of demographic information and active alerts |
| **Visits** | History of all clinical visits |
| **Appointments** | Past and upcoming appointments |
| **Prescriptions** | All prescriptions issued to this patient |
| **Lab Results** | Lab orders and test results |
| **Invoices** | Billing history and outstanding balances |
| **Documents** | Uploaded medical files |
| **Referrals** | Referrals sent to or from this patient |

### Patient Alerts

Alerts are notes displayed prominently on the patient profile for clinical staff (e.g., drug allergies, chronic conditions). They appear at the top of the Overview tab and in the queue when the patient is called.

---

## Editing a Patient

1. Open the patient profile.
2. Click **Edit** (top-right).
3. Update the relevant fields.
4. Click **Save**.

---

## Deactivating a Patient

Patients cannot be permanently deleted to preserve medical record integrity. To remove a patient from active searches:

1. Open the patient profile and click **Edit**.
2. Toggle the **Active** field to off.
3. Save.

Inactive patients still appear when the "All" filter is selected.

---

## Patient Codes

Every patient is automatically assigned a unique **Patient Code** (format: `CLINIC-####`) when registered. This code:
- Appears on all invoices, prescriptions, and lab results.
- Can be used to search for the patient.
- Is printed on QR codes for quick check-in (if QR check-in is enabled).

---

## Tips

- Before registering a new patient, search by name and phone number to avoid duplicates.
- Adding a patient's email enables automated appointment reminders (if email is configured in Settings).
- PWD and senior discount rates are set in **Settings → Billing**.
