# E-Prescription System

Complete guide to creating, managing, and dispensing electronic prescriptions in MyClinicSoft.

## Overview

The E-Prescription system provides digital prescription management with:
- Electronic prescription creation
- Drug interaction checking
- Allergy warnings
- Formulary integration
- Digital signatures
- Prescription printing
- Dispensing tracking
- Refill management

## Accessing Prescriptions

Navigate to **Prescriptions** from the main menu.

**View Options:**
- All prescriptions
- Active prescriptions
- Completed prescriptions
- Pending dispensing
- By patient
- By doctor
- By date range

## Creating a Prescription

### From Clinical Visit

**During Patient Visit:**
1. While documenting visit, click **Create Prescription**
2. Patient and doctor pre-filled
3. Prescription form opens
4. Add medications
5. Save and link to visit

### Direct Prescription Creation

1. Go to **Prescriptions** → **New Prescription**
2. Fill in prescription details

## Prescription Form

### Patient Information

**Auto-filled:**
- Patient name
- Patient ID
- Age
- Weight (for dosing calculations)
- Known allergies (displayed prominently)

**Allergy Warning:**
If patient has known drug allergies, prominent warning displayed:
```
⚠️ ALLERGY ALERT
Patient allergic to: Penicillin, Sulfa drugs
Reaction: Rash, swelling
```

### Doctor Information

**Auto-filled:**
- Prescribing doctor name
- License number
- Specialty
- Digital signature

### Prescription Details

**Date:**
- Date written (defaults to today)
- Valid until (typically 1 year)

**Diagnosis:**
- Linked from visit (if applicable)
- Or manually enter
- ICD-10 code recommended

## Adding Medications

### Search for Medication

1. Click **Add Medication**
2. Search by:
   - Generic name (e.g., "Amoxicillin")
   - Brand name (e.g., "Amoxil")
   - Indication (e.g., "antibiotic")
3. Select from results

**Search Results Show:**
- Generic name
- Brand name(s)
- Strength available
- Form (tablet, capsule, syrup)
- Stock level (if in inventory)

### Medication Details

For each medication, specify:

#### Basic Information
- **Medication Name*** (required)
  - Auto-filled from selection
  - Example: Amoxicillin 500mg capsule
  
- **Quantity*** (required)
  - Number to dispense
  - Example: 21 capsules
  - System checks stock availability

#### Dosing Instructions

- **Dosage*** (required)
  - How much to take
  - Example: 1 capsule, 2 tablets, 5 mL
  
- **Frequency*** (required)
  - How often
  - Dropdown options:
    - Once daily (QD)
    - Twice daily (BID)
    - Three times daily (TID)
    - Four times daily (QID)
    - Every 4 hours
    - Every 6 hours
    - Every 8 hours
    - Every 12 hours
    - As needed (PRN)
    - Custom
  
- **Duration*** (required)
  - How long
  - Examples:
    - 7 days
    - 2 weeks
    - 1 month
    - Until finished
    - Ongoing

- **Route**
  - Oral (PO) - default
  - Sublingual (SL)
  - Topical
  - Inhalation
  - Injection (IM, IV, SC)
  - Rectal
  - Ophthalmic
  - Otic

#### Special Instructions

- **Instructions** (detailed directions)
  - Examples:
    - "Take with food"
    - "Take on empty stomach"
    - "Take before bedtime"
    - "Dissolve in water"
    - "Do not crush or chew"
    - "Complete full course even if feeling better"
  
- **Purpose** (patient education)
  - Examples:
    - "For infection"
    - "For pain relief"
    - "For blood pressure"
    - "To prevent complications"

### Example Medication Entry

```
Medication: Amoxicillin 500mg capsule
Quantity: 21 capsules
Dosage: 1 capsule
Frequency: Three times daily (TID)
Duration: 7 days
Route: Oral
Instructions: Take with food. Complete full course.
Purpose: For bacterial infection
```

**Patient Sees (Plain Language):**
```
Amoxicillin 500mg capsule
Take 1 capsule by mouth three times daily for 7 days
Take with food
Complete the full course even if you feel better
This medication is for your bacterial infection
```

## Drug Interaction Checking

### Automatic Checking

System automatically checks for interactions:

**Checks Against:**
- Other medications in current prescription
- Patient's active prescriptions
- Patient's regular medications (in medical history)

**Interaction Types:**
- 🔴 **Severe** - Do not use together
- 🟠 **Moderate** - Use with caution
- 🟡 **Minor** - Monitor patient

**Interaction Alert:**
```
⚠️ DRUG INTERACTION WARNING

Interaction: Warfarin + Amoxicillin
Severity: Moderate
Effect: Increased bleeding risk
Recommendation: Monitor INR closely. Consider dose adjustment.

Continue anyway? [Yes] [No] [View Details]
```

**Doctor Actions:**
- Review interaction details
- Consult reference materials
- Modify prescription if needed
- Document reason if proceeding
- Add monitoring instructions

### Allergy Checking

System checks medications against patient allergies:

**Allergy Alert:**
```
🚨 ALLERGY ALERT

Patient is allergic to: Penicillin
You are prescribing: Amoxicillin (Penicillin family)
Known reaction: Rash, difficulty breathing

This medication should NOT be prescribed!

[Change Medication] [Document Override]
```

**Override:**
- Requires documentation
- Reason must be compelling
- Additional monitoring required
- Patient counseling documented

## Multi-Drug Prescriptions

### Adding Multiple Medications

1. Add first medication (complete all details)
2. Click **Add Another Medication**
3. Add second medication
4. System checks interactions
5. Continue adding as needed

**Common Multi-Drug Scenarios:**

**Example 1: Antibiotic + Pain Relief**
```
1. Amoxicillin 500mg - for infection
2. Ibuprofen 400mg - for pain/inflammation
3. Vitamin B-complex - to prevent side effects
```

**Example 2: Hypertension Treatment**
```
1. Losartan 50mg - morning
2. Amlodipine 5mg - evening
3. Aspirin 81mg - morning (cardioprotection)
```

**Example 3: Diabetes Management**
```
1. Metformin 500mg - twice daily
2. Glimepiride 2mg - morning
3. Vitamins for diabetics - daily
```

### Prescription Summary

Shows all medications in one view:
- Quick review before finalizing
- Check for duplicates
- Verify dosages
- Confirm durations
- Total cost estimate

## Additional Instructions

### General Instructions

Add instructions for entire prescription:
- When to take medications
- Storage instructions
- What to avoid
- When to follow up
- Emergency instructions

**Example:**
```
GENERAL INSTRUCTIONS:
- Take all medications as directed
- Store in cool, dry place
- Avoid alcohol while taking antibiotics
- Return for follow-up in 1 week
- Call immediately if symptoms worsen or new symptoms develop
- Complete antibiotic course even if feeling better
```

### Pharmacy Instructions

Special instructions for pharmacist:
- Dispensing notes
- Substitution allowed/not allowed
- Special preparation
- Patient counseling points

## Prescription Validation

Before saving, system validates:

**Required Fields:**
- ✅ Patient selected
- ✅ Doctor identified
- ✅ At least one medication
- ✅ All dosages specified
- ✅ All frequencies specified
- ✅ All durations specified

**Safety Checks:**
- ✅ No severe drug interactions (or documented)
- ✅ No allergy conflicts (or documented)
- ✅ Dosages within safe range
- ✅ Durations appropriate
- ✅ Stock available (if dispensing)

**Warnings:**
- ⚠️ Unusually high dose
- ⚠️ Unusually long duration
- ⚠️ Duplicate medication
- ⚠️ Age-inappropriate medication

## Saving and Signing

### Digital Signature

1. Review complete prescription
2. Click **Sign Prescription**
3. Enter password or use digital signature device
4. Prescription digitally signed

**Digital Signature Includes:**
- Doctor's name and license number
- Date and time of signing
- Secure hash of prescription
- Cannot be altered after signing

### Saving Options

- **Save Draft** - Save without signing (can edit later)
- **Save and Sign** - Finalize prescription
- **Save and Print** - Print immediately after saving
- **Save and Dispense** - Go directly to dispensing

## Printing Prescriptions

### Prescription Format

Professional prescription with:

```
[Clinic Logo and Letterhead]

PRESCRIPTION
Rx No: RX-2024-00567
Date: January 15, 2024

Patient: Maria Santos                    Age: 39 years
Patient ID: PT-2024-00123               Weight: 58 kg

Known Allergies: None

Diagnosis: Acute Upper Respiratory Tract Infection (J06.9)

------------------------------------------------

Rx

1. Amoxicillin 500mg capsule
   Disp: 21 capsules
   Sig: Take 1 capsule by mouth three times daily for 7 days
        Take with food. Complete full course.

2. Cetirizine 10mg tablet
   Disp: 7 tablets
   Sig: Take 1 tablet by mouth once daily for 7 days
        Take before bedtime.

3. Vitamin C 500mg tablet
   Disp: 30 tablets
   Sig: Take 1 tablet by mouth once daily for 30 days

------------------------------------------------

INSTRUCTIONS:
- Take all medications as directed
- Drink plenty of fluids
- Get adequate rest
- Return if no improvement in 3 days
- Call immediately if difficulty breathing

Generic substitution: ☐ Allowed  ☑ Not Allowed

------------------------------------------------

Dr. Juan Dela Cruz, MD
License No: 1234567
[Digital Signature]

Valid for: 1 year from date issued
This is an electronic prescription

[QR Code for verification]

[Clinic Contact Information]
```

### Printing Options

- **Original** - For patient/pharmacy
- **Copy** - For patient records
- **Duplicate** - If lost (marked as duplicate)

**Print Settings:**
- Print on letterhead
- Include clinic logo
- Include QR code for verification
- Watermark for copies

## Prescription Dispensing

### Recording Dispensing

When medication given to patient:

1. Open prescription
2. Click **Mark as Dispensed**
3. Record details:
   - Date dispensed
   - Quantity actually dispensed
   - Batch number (for tracking)
   - Expiration date
   - Dispensed by (staff member)
   - Patient signature (optional)

**System Actions:**
- Updates prescription status to "Dispensed"
- Deducts from inventory
- Links to inventory transaction
- Records in patient medication history
- Generates dispensing label (optional)

### Partial Dispensing

If full quantity not available:

1. Click **Partially Dispense**
2. Enter quantity dispensed
3. System tracks remaining quantity
4. Patient can return for balance

**Example:**
```
Prescribed: 30 tablets
Dispensed: 15 tablets (stock low)
Remaining: 15 tablets (to dispense later)
Status: Partially Dispensed
```

### Dispensing Label

Optional label for medication packaging:

```
[Clinic Name]

Maria Santos
Take 1 capsule three times daily for 7 days
Take with food

Amoxicillin 500mg capsule
Qty: 21
Dispensed: Jan 15, 2024
Expires: Dec 2025
Batch: BA12345

☎ Call clinic with questions
```

## Prescription Refills

### Requesting Refill

**Patient Requests Refill:**
- Via phone call
- Via patient portal
- In person

**Staff Process:**
1. Search for patient
2. View medication history
3. Find original prescription
4. Click **Refill Prescription**
5. System creates new prescription
6. Pre-filled with same medications
7. Review and update if needed
8. Doctor approval (if required)

**Refill Rules:**
- Non-controlled substances: Can refill
- Controlled substances: New prescription required
- Expired prescriptions: New consultation needed
- Maximum refills: Per clinic policy

### Refill Approval

If prescription requires doctor approval:

1. Refill request created
2. Doctor notified
3. Doctor reviews:
   - Original prescription
   - Patient's recent visits
   - Current condition
   - Lab results (if applicable)
4. Doctor approves or denies
5. If approved, prescription activated
6. Patient notified

### Prescription Reminders

**Refill Reminders:**
- Sent before medication runs out
- Based on: Quantity ÷ Daily dose = Days supply
- Reminder sent: 7 days before running out

**Example:**
```
Hi Maria, your Amoxicillin prescription will run out in 7 days.
If you need more, please contact us to schedule follow-up.
- YourClinic
```

## Managing Prescriptions

### Viewing Prescription History

**Patient Level:**
1. Go to patient record
2. **Medications** tab
3. See all prescriptions:
   - Current/active
   - Completed
   - Cancelled
   - Historical

**System Level:**
1. Go to **Prescriptions**
2. Search and filter:
   - By patient
   - By doctor
   - By medication
   - By date range
   - By status

### Editing Prescriptions

**Before Dispensing:**
- Can edit freely
- Update medications
- Change dosages
- Add instructions
- Re-sign after changes

**After Dispensing:**
- Cannot edit
- Must create new prescription
- Or add addendum note

### Cancelling Prescriptions

If prescription no longer needed:

1. Open prescription
2. Click **Cancel Prescription**
3. Enter reason:
   - Patient declined
   - Error in prescription
   - Changed treatment plan
   - Patient allergic
   - Other
4. Confirm cancellation

**System Actions:**
- Status: Cancelled
- If already dispensed, no stock reversal
- Documented in patient record
- Doctor notified

## Prescription Reports

### Available Reports

Navigate to **Reports** → **Prescriptions**

**Reports:**
- Prescriptions by doctor
- Prescriptions by medication
- Most prescribed medications
- Prescription patterns
- Controlled substance log
- Dispensing report
- Refill report
- Prescription costs

**Analysis:**
- Prescribing trends
- Medication costs
- Generic vs. brand usage
- Controlled substance tracking
- Compliance with formulary

## Controlled Substances

### Special Handling

For controlled medications (narcotics, etc.):

**Additional Requirements:**
- Special prescription form
- Cannot be refilled (new Rx each time)
- Dual authorization (if required)
- Special logging
- Regulatory reporting

**Controlled Substance Prescription:**
```
⚠️ CONTROLLED SUBSTANCE
SCHEDULE II - OPIOID

[Red border on prescription]
[Additional security features]
[Stricter signature requirements]
```

**Tracking:**
- Every prescription logged
- Every dispensing recorded
- Regular inventory reconciliation
- Reports to authorities
- Audit trail maintained

## Patient Medication List

### Current Medications

Patient's complete medication list:
- All active prescriptions
- Over-the-counter medications
- Supplements and vitamins
- External medications (from other doctors)

**Use for:**
- Drug interaction checking
- Medication reconciliation
- Discharge planning
- Referrals to specialists

### Medication History

Complete medication history:
- All medications ever prescribed
- When prescribed
- By which doctor
- For what condition
- Duration taken
- Effectiveness notes

**Clinical Value:**
- Track treatment history
- Identify effective medications
- Avoid failed treatments
- Monitor adherence patterns

## Tips for Safe Prescribing

1. **Verify Patient** - Confirm correct patient
2. **Check Allergies** - Always review allergies first
3. **Review Current Meds** - Check what patient already taking
4. **Use Generic Names** - Clearer, avoid brand confusion
5. **Be Specific** - Clear dosing instructions
6. **Check Interactions** - Don't override without good reason
7. **Document Thoroughly** - Detailed instructions help compliance
8. **Consider Cost** - Prescribe affordable options when possible
9. **Follow Up** - Schedule review for chronic medications
10. **Educate Patient** - Explain purpose and proper use

## Common Issues

### Patient Cannot Afford Medication

**Solutions:**
- Prescribe generic alternative
- Reduce quantity (starter pack)
- Split prescription (dispense gradually)
- Patient assistance programs
- Alternative medication
- Free samples (if available)

### Medication Out of Stock

**Solutions:**
- Prescribe alternative medication
- Reduce quantity temporarily
- Refer to external pharmacy
- Order for next visit
- Emergency supply from another source

### Patient Confused About Instructions

**Solutions:**
- Use plain language
- Write clearly on prescription
- Verbal counseling
- Demonstration if needed
- Written patient education materials
- Follow-up call

## Best Practices

1. **Always Check Allergies** - Before prescribing anything
2. **Use Standard Abbreviations** - Avoid confusion
3. **Include Purpose** - Helps patient understand and remember
4. **Simple Regimens** - Once or twice daily better than complex
5. **Appropriate Duration** - Not too short, not too long
6. **Patient Education** - Explain how and why
7. **Follow Up** - Schedule review for chronic medications
8. **Document Everything** - Include rationale for choices
9. **Consider Compliance** - Prescribe what patient can actually do
10. **Safety First** - When in doubt, consult references

## Related Documentation

- [Clinical Visits](CLINICAL_VISITS.md)
- [Inventory Management](INVENTORY_MANAGEMENT.md)
- [Patient Management](PATIENT_MANAGEMENT.md)
- [Billing and Payments](BILLING_PAYMENTS.md)
