# Clinical Visits and Notes

Complete guide to documenting patient consultations, clinical notes, diagnoses, and treatment plans in MyClinicSoft.

## Overview

The Clinical Visits system allows healthcare providers to:

- Document patient consultations
- Record vital signs and examination findings
- Add diagnoses using ICD-10 codes
- Create treatment plans
- Generate medical certificates
- Track visit history
- Integrate with prescriptions and lab orders

## Accessing Clinical Notes

Navigate to **Clinical Notes** from the main menu.

**View Options:**
- All visits (default)
- Today's visits
- My visits (current doctor only)
- Filter by patient, doctor, or date range
- Search by diagnosis or chief complaint

## Creating a New Visit

### Starting a Visit

**From Appointment:**
1. Go to **Appointments**
2. Click on appointment
3. Click **Start Visit**
4. Visit form opens with patient and doctor pre-filled

**From Patient Record:**
1. Go to **Patients**
2. Select patient
3. Click **New Visit**
4. Select doctor
5. Visit form opens

**Direct Entry:**
1. Go to **Clinical Notes**
2. Click **New Visit**
3. Select patient and doctor
4. Fill in visit details

### Visit Information

#### Basic Details
- **Patient*** (required) - Auto-filled from appointment/patient page
- **Doctor*** (required) - Default to logged-in doctor
- **Visit Date and Time*** (required) - Defaults to current date/time
- **Visit Type**
  - New Patient Consultation
  - Follow-up Visit
  - Emergency Visit
  - Routine Check-up
  - Procedure
  - Sick Visit
  - Wellness Visit

#### Chief Complaint
- **Chief Complaint*** (required)
  - Primary reason for visit
  - Patient's own words
  - Brief description
  
**Examples:**
- "Headache for 3 days"
- "Cough and fever"
- "Follow-up for hypertension"
- "Routine annual checkup"

### History of Present Illness (HPI)

Detailed narrative of the presenting problem:

**Components:**
- Onset - When symptoms started
- Location - Where the problem is
- Duration - How long it has lasted
- Character - Quality/description
- Aggravating factors - What makes it worse
- Relieving factors - What makes it better
- Timing - Pattern or frequency
- Severity - How bad it is (scale 1-10)
- Associated symptoms

**Example:**
```
Patient reports headache starting 3 days ago, located in frontal region.
Describes as throbbing pain, severity 7/10. Worse with bright lights and
noise. Partially relieved by rest and darkness. Associated with nausea
but no vomiting. No fever or vision changes.
```

### Review of Systems (ROS)

Systematic review of body systems:

**Systems:**
- ✅ Constitutional (fever, weight loss, fatigue)
- ✅ Eyes (vision, pain, discharge)
- ✅ Ears/Nose/Throat (hearing, congestion, sore throat)
- ✅ Cardiovascular (chest pain, palpitations, edema)
- ✅ Respiratory (cough, shortness of breath, wheezing)
- ✅ Gastrointestinal (nausea, abdominal pain, bowel changes)
- ✅ Genitourinary (urination, discharge)
- ✅ Musculoskeletal (joint pain, muscle weakness)
- ✅ Skin (rash, lesions, itching)
- ✅ Neurological (headache, dizziness, seizures)
- ✅ Psychiatric (mood, anxiety, sleep)
- ✅ Endocrine (temperature intolerance, thirst)
- ✅ Hematologic (bleeding, bruising)
- ✅ Allergic/Immunologic

**For Each System:**
- Check "No symptoms" or
- Document positive findings
- Note severity and duration

### Vital Signs

Record patient vital signs:

**Standard Vitals:**
- **Blood Pressure** (mmHg)
  - Systolic / Diastolic
  - Example: 120/80
  - Flag: High (>140/90), Low (<90/60)
- **Heart Rate** (bpm)
  - Normal: 60-100 bpm
  - Flag: Tachycardia (>100), Bradycardia (<60)
- **Respiratory Rate** (breaths/min)
  - Normal: 12-20/min
  - Flag: Tachypnea (>20), Bradypnea (<12)
- **Temperature** (°C or °F)
  - Normal: 36.5-37.5°C (97.7-99.5°F)
  - Flag: Fever (>38°C/100.4°F), Hypothermia (<36°C/96.8°F)
- **Oxygen Saturation** (%)
  - Normal: 95-100%
  - Flag: <95%

**Additional Measurements:**
- **Weight** (kg or lbs)
- **Height** (cm or inches)
- **BMI** - Auto-calculated from weight/height
  - Normal: 18.5-24.9
  - Underweight: <18.5
  - Overweight: 25-29.9
  - Obese: ≥30
- **Pain Scale** (0-10)
  - 0 = No pain
  - 1-3 = Mild
  - 4-6 = Moderate
  - 7-10 = Severe

**Automatic Alerts:**
- System flags abnormal vitals
- Shows in patient record
- Alerts appear in dashboard

### Physical Examination

Document examination findings:

**General Appearance:**
- Well-appearing / Ill-appearing
- Alert and oriented
- In no acute distress / In distress
- Age-appropriate

**Examination by System:**

Use templates or free-text entry for:
- HEENT (Head, Eyes, Ears, Nose, Throat)
- Neck
- Cardiovascular
- Respiratory
- Abdomen
- Musculoskeletal
- Neurological
- Skin
- Psychiatric

**Template Example (Cardiovascular):**
```
Regular rate and rhythm, no murmurs, rubs, or gallops.
S1 and S2 heard. No peripheral edema. Pulses 2+ bilaterally.
```

**Templates Available:**
- Normal examination templates
- System-specific templates
- Specialty templates
- Custom templates (create your own)

### Diagnoses

Add diagnoses with ICD-10 codes:

**Adding a Diagnosis:**
1. Click **Add Diagnosis**
2. Search by:
   - Disease name
   - ICD-10 code
   - Symptoms
3. Select from results
4. Set type:
   - Primary diagnosis
   - Secondary diagnosis
   - Rule-out diagnosis
5. Add notes if needed

**ICD-10 Search Examples:**
- "hypertension" → I10: Essential (primary) hypertension
- "diabetes" → E11: Type 2 diabetes mellitus
- "asthma" → J45: Asthma
- "pneumonia" → J18: Pneumonia

**Multiple Diagnoses:**
- Add as many as needed
- First one is primary
- Drag to reorder
- Mark as chronic condition

**Diagnosis Details:**
- Severity (mild, moderate, severe)
- Status (active, resolved, chronic)
- Onset date
- Notes

### Assessment and Plan

Document your assessment and treatment plan:

**Assessment:**
- Summary of findings
- Clinical reasoning
- Differential diagnoses considered
- Diagnostic impression

**Plan:**
Organize by category:

1. **Medications**
   - Link to create prescription
   - List new medications
   - Changes to existing medications
   - Medication stopped

2. **Laboratory/Diagnostic Tests**
   - Link to order lab tests
   - Tests ordered
   - Reason for tests
   - When to perform

3. **Procedures**
   - Procedures performed today
   - Procedures to schedule
   - Referrals needed

4. **Education**
   - Patient education provided
   - Resources given
   - Lifestyle modifications

5. **Follow-up**
   - When to return
   - What to monitor
   - When to call clinic

**Example Plan:**
```
1. Start Lisinopril 10mg daily for hypertension
2. Order lipid panel and HbA1c
3. Advised on DASH diet and exercise
4. Follow-up in 2 weeks to check BP and review labs
5. Call if BP >140/90 or symptoms worsen
```

### Clinical Notes

Free-text clinical documentation:

**Clinical Notes Section:**
- Additional observations
- Patient questions and answers
- Family concerns
- Social context
- Treatment preferences

**Tips for Good Documentation:**
- Be clear and concise
- Use medical terminology appropriately
- Document relevant negatives
- Note patient's understanding
- Record consent for procedures

### Visit Documents

Attach documents to visit:

**Document Types:**
- Images (photos of lesions, injuries)
- External reports
- Consent forms
- Procedure notes
- Referral letters

**Upload:**
1. Click **Attach Document**
2. Select file
3. Add description
4. Click **Upload**

## Saving and Completing Visit

### Save Options

- **Save Draft** - Save and continue editing later
- **Save and Close** - Complete visit and close
- **Save and Print** - Save and print visit summary

**Auto-save:**
- System auto-saves every 2 minutes
- Prevents data loss
- Recovery available if browser crashes

### Visit Status

- **Draft** - In progress, can be edited
- **Completed** - Visit finalized, appears in patient history
- **Amended** - Visit edited after completion (audit trail maintained)

## Viewing Visit History

### Visit List

View all visits for a patient:

1. Go to patient detail page
2. Click **Visit History** tab
3. See chronological list of visits

**Display:**
- Visit date
- Doctor
- Chief complaint
- Diagnoses
- Status

**Actions:**
- View visit details
- Print visit summary
- Copy to new visit (use as template)
- Amend visit (if needed)

### Visit Detail View

Click on any visit to see:

- Complete visit documentation
- Vitals flowsheet
- Diagnosis list
- Treatment plan
- Linked prescriptions
- Linked lab orders
- Visit timeline

## Medical Certificates

Generate medical certificates from visits:

### Creating Medical Certificate

1. Open visit
2. Click **Generate Medical Certificate**
3. Fill in certificate details:
   - Patient name (auto-filled)
   - Diagnosis (auto-filled)
   - Recommendations
     - Rest for X days
     - Unfit for work/school
     - May resume activities
   - Certificate date
   - Doctor signature
4. Click **Generate**

**Certificate Includes:**
- Clinic letterhead
- Patient information
- Visit date
- Diagnosis
- Medical recommendations
- Doctor's name and license number
- Doctor's signature
- Official clinic seal

**Uses:**
- Work/school excuse
- Insurance claims
- Disability applications
- Court/legal purposes

### Managing Certificates

**Print:**
- PDF format
- Professional layout
- On clinic letterhead

**Send:**
- Email to patient
- Include in patient portal

**Track:**
- All certificates logged
- Audit trail maintained
- Reprint anytime

## Lab Request Forms

Order laboratory tests from visit:

### Creating Lab Order

1. During visit or from completed visit
2. Click **Order Labs**
3. Select tests:
   - CBC (Complete Blood Count)
   - Chemistry panel
   - Lipid panel
   - HbA1c
   - Urinalysis
   - Custom tests
4. Add clinical indication
5. Mark as STAT if urgent
6. Click **Create Order**

**Lab Request Form Includes:**
- Patient demographics
- Tests ordered
- Clinical indication
- Ordering doctor
- Date ordered
- Special instructions

**Actions:**
- Print for patient (if external lab)
- Send to integrated lab
- Track results in **Lab Results** section

## Visit Templates

Create templates for common visit types:

### Using Templates

1. Click **New Visit**
2. Select **Use Template**
3. Choose template:
   - Annual Physical
   - Hypertension Follow-up
   - Diabetes Check
   - Well-child Visit
   - Post-op Check
4. Template populates form
5. Edit as needed

### Creating Custom Templates

*For doctors with permission*

1. Complete a visit
2. Click **Save as Template**
3. Name template
4. Select what to include:
   - ROS sections
   - Physical exam sections
   - Common diagnoses
   - Standard plan
5. Click **Save Template**

**Template Uses:**
- Save time on similar visits
- Standardize documentation
- Ensure completeness
- Train new staff

## Visit Amendments

Correct or add to completed visit:

### When to Amend

- Correct documentation error
- Add missed information
- Clarify unclear notes
- Update based on additional info

### How to Amend

1. Open completed visit
2. Click **Amend Visit**
3. System creates addendum entry
4. Make changes
5. Add reason for amendment
6. Click **Save Amendment**

**Amendment Tracking:**
- Original visit preserved
- Changes highlighted
- Amendment timestamp
- Reason documented
- Audit trail maintained

**Note:** Cannot delete visits, only amend. This maintains legal compliance.

## Integration with Other Features

### Prescriptions

From visit, create prescriptions:
1. Click **Create Prescription**
2. Patient and doctor auto-filled
3. Add medications
4. Save prescription
5. Prescription linked to visit

### Lab Results

Lab orders from visit automatically link:
- View pending labs
- See completed results
- Results appear in visit record

### Billing

Generate invoice from visit:
1. Click **Create Invoice**
2. Services auto-filled from visit
3. Add medications/procedures
4. Calculate total
5. Save invoice

### Follow-up Appointments

Schedule follow-up directly:
1. Click **Schedule Follow-up**
2. Select recommended timeframe
3. Choose date/time
4. Save appointment
5. Patient notified

## Visit Reports and Analytics

### Available Reports

Navigate to **Reports** → **Clinical**

**Reports:**
- Visits by date range
- Visits by doctor
- Visits by diagnosis
- Patient encounter frequency
- Average visit duration
- Common diagnoses
- Chief complaints analysis

**Charts:**
- Visit volume over time
- Diagnosis distribution
- Doctor productivity
- Visit types breakdown

## Tips for Effective Documentation

1. **Document in Real-Time** - Write notes during or immediately after visit
2. **Be Specific** - Include details that matter
3. **Use Templates** - Save time while maintaining completeness
4. **Record Pertinent Negatives** - Note what wasn't present
5. **Write for Others** - Someone else may need to read your notes
6. **Include Patient Education** - Document what you taught
7. **Note Follow-up Plan** - Clear instructions for patient and staff
8. **Review Before Finalizing** - Check for completeness and accuracy
9. **Use Structured Format** - Follow SOAP or HPIP format consistently
10. **Sign and Date** - Finalize visits promptly

## SOAP Notes Format

Optional structured format:

**S (Subjective):**
- Chief complaint
- History of present illness
- Review of systems
- Patient's perspective

**O (Objective):**
- Vital signs
- Physical examination findings
- Lab results
- Imaging results

**A (Assessment):**
- Diagnoses (ICD-10)
- Clinical reasoning
- Differential diagnoses

**P (Plan):**
- Medications
- Procedures
- Tests ordered
- Follow-up
- Patient education

## Mobile Access

Access visits on mobile devices:

**Mobile Features:**
- View visit history
- Quick visit documentation
- Voice-to-text for notes
- Capture photos
- Review pending visits
- Complete visits

## Troubleshooting

### Cannot Save Visit

**Possible Causes:**
- Missing required fields
- Internet connection lost
- Session expired

**Solutions:**
- Check for red field indicators
- Verify internet connection
- If session expired, copy notes and re-login
- Use auto-save recovery

### ICD-10 Code Not Found

**Solutions:**
- Try different search terms
- Use symptom-based search
- Browse by category
- Add custom diagnosis (admin approval needed)

### Templates Not Loading

**Solutions:**
- Refresh page
- Check browser compatibility
- Clear cache
- Contact IT support

## Best Practices

1. **Timely Documentation** - Complete within 24 hours
2. **Accurate Vitals** - Double-check measurements
3. **Complete ROS** - Don't skip systems
4. **Specific Diagnoses** - Use exact ICD-10 codes
5. **Clear Plans** - Patient should understand next steps
6. **Link Records** - Connect prescriptions, labs, referrals
7. **Professional Language** - Medical terminology, no slang
8. **Objective Tone** - Facts, not opinions
9. **Legibility** - Clear writing or typing
10. **Compliance** - Follow documentation standards

## Legal Considerations

**Documentation Standards:**
- All visits must be documented
- Maintain objectivity
- Include informed consent
- Note patient non-compliance
- Document communications
- Preserve confidentiality

**Medical-Legal Protection:**
- Complete documentation protects you
- "If it's not documented, it wasn't done"
- Amendments must be transparent
- Never alter original records
- Maintain audit trail

## Related Documentation

- [Patient Management](PATIENT_MANAGEMENT.md)
- [Prescriptions](EPRESCRIPTION.md)
- [Lab Results](LABORATORY_DIAGNOSTIC.md)
- [Appointment Scheduling](APPOINTMENT_SCHEDULING.md)
- [Billing and Invoicing](BILLING_PAYMENTS.md)
