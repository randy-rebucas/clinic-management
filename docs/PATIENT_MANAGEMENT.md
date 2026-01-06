# Patient Management

Complete guide to managing patient records, demographics, and medical history in MyClinicSoft.

## Overview

The Patient Management system provides a centralized location for all patient-related information, including:

- Patient demographics
- Contact information
- Medical history
- Visit history
- Prescriptions
- Lab results
- Documents and files
- Outstanding balances
- Membership information

## Patient List

### Viewing Patients

Navigate to **Patients** to access the patient list.

**Features:**
- Search by name, ID, or contact information
- Filter by various criteria
- Sort by name, date added, or last visit
- Quick view of patient status

**Patient Status Indicators:**
- 🟢 Active - Regular patients
- 🟡 New - Recently registered
- 🔴 Alert - Has important alerts or outstanding balances

### Search and Filter

**Search Options:**
- Patient name
- Patient ID
- Phone number
- Email address

**Filter Options:**
- Registration date range
- Age range
- Gender
- Membership status
- Insurance provider

## Adding a New Patient

### Step-by-Step Guide

1. Click **New Patient** button
2. Fill in required information (marked with *)
3. Complete optional sections
4. Click **Save**

### Patient Information Sections

#### Personal Information
- **Full Name*** (required)
- **Date of Birth*** (required)
- **Gender*** (Male/Female/Other)
- **Blood Type** (A+, A-, B+, B-, AB+, AB-, O+, O-)
- **Civil Status** (Single/Married/Widowed/Divorced)

#### Contact Information
- **Phone Number*** (primary contact)
- **Email Address**
- **Address**
  - Street
  - City
  - Province/State
  - Postal Code
  - Country

#### Emergency Contact
- **Contact Name***
- **Relationship***
- **Phone Number***
- **Alternate Phone**

#### Insurance Information
- **Insurance Provider**
- **Policy Number**
- **Coverage Type**
- **Expiration Date**
- **Pre-authorization Required** (Yes/No)

#### Additional Information
- **Occupation**
- **Referred By** (how they found your clinic)
- **Notes** (special considerations)

### Patient ID

The system automatically generates a unique Patient ID upon saving. This ID is used throughout the system to reference the patient.

## Patient Detail View

### Overview Tab

The patient detail page shows:

**Patient Header:**
- Name and photo
- Patient ID
- Age and date of birth
- Contact information
- Quick action buttons

**Summary Cards:**
- Last visit date
- Next appointment
- Outstanding balance
- Active prescriptions
- Recent lab results

**Quick Actions:**
- Schedule appointment
- Create visit
- Write prescription
- Generate invoice
- Upload document

### Medical History

**Chronic Conditions:**
- Add/edit chronic conditions
- Track onset date
- Note current treatment
- Set active/inactive status

**Allergies:**
- Drug allergies
- Food allergies
- Environmental allergies
- Severity level
- Reaction description

**Past Medical History:**
- Previous illnesses
- Surgeries and procedures
- Hospitalizations
- Immunizations

**Family History:**
- Hereditary conditions
- Family member affected
- Relationship to patient

**Social History:**
- Smoking status
- Alcohol consumption
- Exercise habits
- Occupation
- Living situation

### Visit History

View all patient visits:
- Visit date
- Doctor
- Chief complaint
- Diagnoses
- Treatment
- Link to full visit record

**Actions:**
- View visit details
- Print visit summary
- Generate medical certificate

### Prescriptions

View all patient prescriptions:
- Prescription date
- Medications
- Prescribing doctor
- Status (active/completed/cancelled)

**Actions:**
- View prescription details
- Print prescription
- Mark as dispensed
- Request refill

### Lab Results

View all lab results:
- Test date
- Test type
- Status (pending/completed)
- Critical results highlighted

**Actions:**
- View detailed results
- Download report
- Share with patient
- Order new test

### Documents

Patient-specific documents:
- ID copies
- Insurance cards
- Medical certificates
- Imaging results
- External records

**Actions:**
- Upload new document
- View/download document
- Delete document
- Share with patient

### Billing

Financial information:
- Total billed
- Total paid
- Outstanding balance
- Recent transactions

**Actions:**
- View all invoices
- Record payment
- Send payment reminder
- Generate statement

### Membership

Loyalty program information:
- Membership tier
- Points balance
- Rewards available
- Referral count

**Actions:**
- Add/remove points
- Redeem rewards
- Upgrade membership
- View history

## Editing Patient Information

1. Open patient detail page
2. Click **Edit** button
3. Modify information
4. Click **Save Changes**

**Note:** Certain fields may be locked for data integrity. Contact your administrator if you need to change locked fields.

## Patient Alerts

### Alert Types

**Medical Alerts:**
- 🔴 Critical allergy
- 🟡 Drug interaction warning
- 🟠 Chronic condition requiring monitoring
- 🔵 Special needs or accommodations

**Administrative Alerts:**
- 💰 Outstanding balance
- 📄 Expired insurance
- ⏰ Overdue appointment
- 📋 Incomplete records

### Managing Alerts

1. View alerts on patient detail page
2. Click alert to view details
3. Take appropriate action
4. Dismiss or resolve alert

## Patient Files and Documents

### Uploading Documents

1. Go to patient detail page
2. Click **Documents** tab
3. Click **Upload Document**
4. Select file type:
   - ID Card
   - Insurance Card
   - Medical Record
   - Lab Result
   - Imaging Result
   - Consent Form
   - Other
5. Add description
6. Select file from computer
7. Click **Upload**

**Supported Formats:**
- PDF (.pdf)
- Images (.jpg, .png)
- Word documents (.doc, .docx)
- Excel spreadsheets (.xls, .xlsx)

**File Size Limit:** 10 MB per file

### Viewing Documents

1. Click on document name
2. Document opens in viewer
3. Options:
   - Download
   - Print
   - Share link
   - Delete

## Patient Portal Integration

Patients can access their own information through the patient portal.

**Portal Features:**
- View medical history
- Schedule appointments
- View prescriptions
- Access lab results
- Update contact information
- Make payments

**Enabling Portal Access:**
1. Go to patient detail page
2. Click **Enable Portal Access**
3. System sends invitation email
4. Patient sets up password
5. Patient can now log in

**Managing Portal Access:**
- Disable access if needed
- Reset patient password
- View patient portal activity

## Data Privacy and Compliance

### PH DPA Compliance

MyClinicSoft is designed to comply with the Philippines Data Privacy Act (PH DPA):

- Secure data storage
- Encrypted sensitive information
- Access controls and audit logs
- Patient consent tracking
- Data retention policies

### Patient Consent

**Consent Types:**
- Treatment consent
- Data sharing consent
- Marketing communications
- Research participation

**Managing Consent:**
1. Go to patient detail page
2. Click **Consent** tab
3. View current consent status
4. Request new consent
5. Record verbal/written consent
6. Print consent forms

### Data Export

Patients have the right to access their data:

1. Go to patient detail page
2. Click **Export Data**
3. Select data to export:
   - Personal information
   - Medical history
   - Visit records
   - Prescriptions
   - Lab results
   - Documents
4. Choose format (PDF or CSV)
5. Click **Generate Export**
6. Share with patient

## Patient Deactivation

### When to Deactivate

- Patient moved away
- Patient passed away
- Patient transferred to another clinic
- Duplicate record

### Deactivation Process

1. Go to patient detail page
2. Click **More Actions** → **Deactivate Patient**
3. Select reason
4. Add notes
5. Confirm deactivation

**Note:** Deactivated patients:
- Don't appear in default patient list
- Cannot be scheduled for appointments
- Records are retained for compliance
- Can be reactivated if needed

## Patient Merge

If duplicate patient records exist:

1. Open one patient record
2. Click **More Actions** → **Merge Records**
3. Search for duplicate record
4. Review both records
5. Select which data to keep
6. Confirm merge

**Warning:** This action cannot be undone. Make sure you're merging the correct records.

## Tips for Efficient Patient Management

1. **Complete Initial Registration** - Gather all information at first visit
2. **Regular Updates** - Update contact info at each visit
3. **Photo ID** - Add patient photo for easy identification
4. **Tag Important Information** - Use alerts for critical medical info
5. **Scan Documents** - Upload insurance cards and IDs immediately
6. **Verify Insurance** - Check insurance status before appointments
7. **Follow Up Reminders** - Schedule follow-up appointments before patient leaves
8. **Portal Access** - Encourage patients to use the patient portal

## Common Issues and Solutions

### Cannot Find Patient

**Solution:**
- Try different search terms
- Check spelling
- Search by phone number
- Check if patient was deactivated
- Look in archived records

### Duplicate Records

**Solution:**
- Use the merge records feature
- If unsure, contact administrator
- Establish naming conventions for data entry

### Missing Information

**Solution:**
- Flag incomplete records
- Call patient to collect info
- Set reminder to update at next visit

### Insurance Verification Failed

**Solution:**
- Verify insurance card details
- Check expiration date
- Contact insurance provider
- Update policy information

## Best Practices

1. **Data Entry Standards**
   - Use consistent formatting for names (First Last)
   - Verify phone numbers (include area code)
   - Complete addresses with postal codes
   - Use official insurance names

2. **Security**
   - Only access records when needed
   - Don't share patient information
   - Lock screen when away
   - Log out when finished

3. **Documentation**
   - Document all patient interactions
   - Note phone conversations
   - Record no-shows
   - Update medical history regularly

4. **Communication**
   - Verify preferred contact method
   - Respect communication preferences
   - Document consent for communications
   - Use secure channels for sensitive info

## Related Documentation

- [Appointment Scheduling](APPOINTMENT_SCHEDULING.md)
- [Clinical Visits](CLINICAL_VISITS.md)
- [Prescriptions](EPRESCRIPTION.md)
- [Billing and Payments](BILLING_PAYMENTS.md)
- [Patient Portal](PATIENT_PORTAL.md)
