# User Journey: Complete Patient Flow

A step-by-step guide following a patient through their entire journey in your clinic using MyClinicSoft.

## Journey Overview

This guide demonstrates a complete patient flow from appointment booking to billing:

1. Patient Books Appointment
2. Patient Checks In
3. Doctor Consultation
4. Prescription Created
5. Lab Tests Ordered
6. Billing and Payment
7. Follow-up Scheduled

Let's follow "Maria Santos" through her first visit to your clinic.

---

## Step 1: Patient Books Appointment

### Scenario
Maria has been experiencing headaches and wants to see a doctor. She visits your clinic's website.

### Actions

**Patient (via Public Booking Page):**

1. Maria visits `https://your-clinic.com/book`
2. She sees available doctors and their specializations
3. She selects "Dr. Juan Dela Cruz - General Practitioner"
4. Calendar shows available slots
5. She selects "Tomorrow, 2:00 PM"
6. She fills in her information:
   - Full Name: Maria Santos
   - Date of Birth: 01/15/1985
   - Phone: +639171234567
   - Email: maria.santos@email.com
   - Reason for Visit: Headaches for the past week
7. She clicks "Book Appointment"
8. Confirmation page appears with appointment details

**System Actions:**
- Creates new patient record
- Creates appointment
- Sends confirmation email to Maria
- Sends SMS confirmation with appointment details
- Notifies clinic staff of new booking

**Maria Receives:**
- Email confirmation with:
  - Appointment date and time
  - Doctor name
  - Clinic address and directions
  - What to bring (ID, insurance card)
  - QR code for check-in
- SMS confirmation: 
  ```
  Appointment confirmed with Dr. Dela Cruz tomorrow at 2:00 PM.
  Show this QR code at check-in. - YourClinic
  ```

**24 Hours Before:**
- Maria receives reminder SMS:
  ```
  Reminder: You have an appointment with Dr. Dela Cruz tomorrow at 2:00 PM.
  Reply CANCEL to cancel. - YourClinic
  ```
- Maria receives reminder email with same information

---

## Step 2: Patient Arrives and Checks In

### Scenario
Maria arrives at the clinic 15 minutes before her appointment.

### Actions

**At Reception:**

1. Maria shows her phone with QR code
2. Receptionist scans QR code using MyClinicSoft
3. System automatically checks her in
4. She's added to the queue

**Alternative (Manual Check-in):**

1. Maria gives her name to receptionist
2. Receptionist searches "Maria Santos" in system
3. Finds her appointment
4. Clicks "Check In"
5. Maria added to queue

**Queue System:**
- Queue number: 5
- Estimated wait time: 20 minutes
- Position: 3rd in line

**Receptionist Actions:**

1. Verifies Maria's information:
   - Checks ID
   - Confirms phone number and email
   - Asks about insurance
2. Collects additional information:
   - Emergency contact
   - Allergies: None known
   - Current medications: None
   - Reason for visit: Confirms headaches
3. Asks Maria to take a seat
4. Gives her a queue number ticket

**System Updates:**
- Appointment status: "Arrived"
- Queue status: "Waiting"
- Display screen shows: "Now serving: Queue #3"

**While Waiting:**
- Maria sees her queue number on the display screen
- She receives SMS update:
  ```
  You are #3 in queue. Estimated wait: 15 minutes. Thank you for your patience.
  ```

---

## Step 3: Called for Consultation

### Scenario
Doctor is ready to see Maria.

### Actions

**Reception/Nurse:**

1. Views queue in MyClinicSoft
2. Clicks "Call Next Patient"
3. System updates display screen:
   ```
   NOW CALLING: Maria Santos (Queue #5)
   Please proceed to Room 2
   ```
4. Announcement plays (optional)
5. Maria receives SMS: "You are next. Please proceed to Room 2."

**In Consultation Room:**

**Nurse Actions:**
1. Greets Maria
2. Takes vital signs in MyClinicSoft:
   - Blood Pressure: 125/82 mmHg
   - Heart Rate: 76 bpm
   - Temperature: 36.8°C
   - Weight: 58 kg
   - Height: 160 cm
   - BMI: Auto-calculated (22.7 - Normal)
3. Asks preliminary questions:
   - Chief complaint: "Headaches for 1 week"
   - Pain level: 6/10
   - When does it hurt: "Mostly in the afternoon"
4. Updates status: "Vitals Taken"
5. Notifies doctor: "Patient ready in Room 2"

**Doctor Actions:**

**Dr. Dela Cruz logs in and sees:**
- Patient name: Maria Santos
- Age: 39 years old
- Vitals: Already entered by nurse
- Chief complaint: Headaches
- Medical history: New patient, no known conditions

**Consultation Process:**

1. **History Taking**
   - Doctor asks detailed questions
   - Documents in "History of Present Illness":
     ```
     39 y/o female presenting with headaches x 1 week.
     Describes as throbbing pain, bifrontal, intensity 6/10.
     Worse in afternoon, especially after work.
     Associated with eye strain from computer work.
     Relieved by rest. No visual changes, no nausea/vomiting.
     No fever, no neurological symptoms.
     ```

2. **Review of Systems**
   - Checks all body systems
   - Documents pertinent positives and negatives
   - Notes: "Eye strain, spends 8+ hours on computer daily"

3. **Physical Examination**
   - General: Alert, well-appearing
   - HEENT: Normal
   - Neurological: No focal deficits
   - Documents findings in MyClinicSoft

4. **Assessment and Diagnosis**
   - Searches for diagnosis: "tension headache"
   - Selects: "G44.209 - Tension-type headache, unspecified"
   - Marks as primary diagnosis

5. **Treatment Plan**
   - Prescribe medication (see Step 4)
   - Recommend ergonomic assessment
   - Advise on screen breaks
   - Order lab tests (see Step 5)
   - Schedule follow-up (see Step 7)

---

## Step 4: Prescription Created

### Scenario
Doctor prescribes medication for Maria's headaches.

### Actions

**Doctor in MyClinicSoft:**

1. From the visit screen, clicks "Create Prescription"
2. Patient pre-filled: Maria Santos
3. Adds medications:

   **Medication 1:**
   - Medicine: Ibuprofen 400mg tablet
   - Dosage: 1 tablet
   - Frequency: Every 6 hours as needed
   - Duration: 7 days
   - Quantity: 28 tablets
   - Instructions: "Take with food. Maximum 4 tablets per day."

   **Medication 2:**
   - Medicine: Multivitamin with B-complex
   - Dosage: 1 tablet
   - Frequency: Once daily
   - Duration: 30 days
   - Quantity: 30 tablets
   - Instructions: "Take after breakfast"

4. System checks drug interactions: ✅ No interactions found

5. Adds general instructions:
   ```
   - Take regular breaks from computer (20-20-20 rule)
   - Maintain good posture
   - Stay hydrated
   - Get adequate sleep
   - Return if headaches worsen or new symptoms appear
   ```

6. Doctor reviews and clicks "Save Prescription"

7. Doctor digitally signs prescription

**System Actions:**
- Links prescription to visit
- Generates prescription number: RX-2024-00567
- Updates inventory:
  - Deducts 28 Ibuprofen tablets
  - Deducts 30 Multivitamin tablets
- Checks stock levels (auto-alert if low)

**Doctor Options:**
- "Print Prescription" - Prints formatted prescription
- "Send to Pharmacy" - Sends to clinic pharmacy (if applicable)
- "Share with Patient" - Sends to patient portal

**Maria Receives:**
- Printed prescription
- Copy sent to her email
- Available in patient portal
- SMS notification:
  ```
  Your prescription is ready. You can pick up your medications
  at the clinic pharmacy. Ref: RX-2024-00567
  ```

---

## Step 5: Lab Tests Ordered

### Scenario
Doctor wants to rule out underlying conditions and check Maria's general health.

### Actions

**Doctor in MyClinicSoft:**

1. From visit screen, clicks "Order Labs"
2. Selects tests:
   - Complete Blood Count (CBC)
   - Fasting Blood Sugar (FBS)
   - Lipid Panel
3. Indicates clinical reason: "Headache workup, health screening"
4. Marks as "Routine" (not STAT/urgent)
5. Clicks "Create Lab Order"

**System Actions:**
- Creates lab order: LAB-2024-00345
- Generates lab request form
- Notifies lab department (if integrated)
- Sends to external lab (if configured)

**Doctor Explains to Maria:**
- Which tests ordered
- Why they're needed
- How to prepare:
  - Fast for 8-10 hours before blood test
  - Come in tomorrow morning
  - Bring lab request form

**Lab Request Form Generated:**
```
LABORATORY REQUEST FORM

Patient: Maria Santos
Age: 39 years
Patient ID: PT-2024-00123
Doctor: Dr. Juan Dela Cruz

Clinical Indication: Headache workup, health screening

Tests Requested:
☑ Complete Blood Count (CBC)
☑ Fasting Blood Sugar (FBS)
☑ Lipid Panel

Special Instructions: Fasting required (8-10 hours)
Date: [Today's Date]
Doctor's Signature: [Digital Signature]
```

**Maria Receives:**
- Printed lab request form
- Instructions on preparation
- Clinic lab hours
- What to bring (ID, lab form)

**Follow-up Lab Process:**

**Next Day - Maria Returns for Blood Draw:**

1. Shows lab request form
2. Lab technician:
   - Verifies identity
   - Confirms fasting status
   - Collects blood samples
   - Updates system: "Sample Collected"

3. Samples sent to lab for processing

**When Results Available (2-3 days later):**

1. Lab uploads results to MyClinicSoft
2. System notifies Dr. Dela Cruz: "Lab results ready for Maria Santos"
3. Doctor reviews results
4. If normal, approves for patient viewing
5. Maria receives notification:
   ```
   Your lab results are ready. View them in your patient portal
   or call the clinic. - YourClinic
   ```

6. Maria logs into patient portal:
   - Views all results
   - Sees doctor's notes: "All results within normal limits"
   - Downloads PDF of results

---

## Step 6: Billing and Payment

### Scenario
After consultation and receiving prescription, Maria proceeds to billing.

### Actions

**At Billing Counter:**

**Staff Actions in MyClinicSoft:**

1. Searches for Maria Santos
2. Clicks "Create Invoice"
3. System auto-fills from visit:
   - Consultation: Dr. Dela Cruz - New Patient
   - Services rendered automatically added

4. Reviews and adds line items:

   **Services:**
   - New Patient Consultation: ₱1,500.00
   - Vital Signs Assessment: ₱0.00 (included)

   **Medications:**
   - Ibuprofen 400mg x 28 tablets: ₱280.00
   - Multivitamin x 30 tablets: ₱450.00

   **Lab Tests:**
   - Complete Blood Count: ₱400.00
   - Fasting Blood Sugar: ₱250.00
   - Lipid Panel: ₱800.00

   **Subtotal:** ₱3,680.00
   **Tax (if applicable):** ₱0.00
   **Total:** ₱3,680.00

5. Asks Maria: "How would you like to pay?"

**Payment Options:**
- Cash
- Credit/Debit Card
- Bank Transfer
- Insurance (if applicable)
- Payment Plan

**Maria chooses:** Cash

6. Staff member:
   - Enters payment method: Cash
   - Enters amount received: ₱4,000.00
   - System calculates change: ₱320.00
   - Clicks "Record Payment"

**System Actions:**
- Marks invoice as "Paid"
- Updates patient balance: ₱0.00
- Deducts medications from inventory
- Links payment to visit
- Generates official receipt

**Maria Receives:**
- Official Receipt (OR):
  ```
  OFFICIAL RECEIPT
  OR No: OR-2024-00789
  
  [Clinic Logo and Details]
  
  Patient: Maria Santos
  Date: [Today's Date]
  
  DESCRIPTION                          AMOUNT
  -----------------------------------------------
  New Patient Consultation            ₱1,500.00
  Ibuprofen 400mg x28                   ₱280.00
  Multivitamin x30                      ₱450.00
  Complete Blood Count                  ₱400.00
  Fasting Blood Sugar                   ₱250.00
  Lipid Panel                           ₱800.00
  -----------------------------------------------
  TOTAL                               ₱3,680.00
  
  Payment Method: Cash
  Amount Paid: ₱4,000.00
  Change: ₱320.00
  
  Received by: [Staff Name]
  [Digital Signature]
  
  This serves as your official receipt.
  Thank you for choosing [Your Clinic]!
  ```

- Email copy of receipt
- SMS confirmation:
  ```
  Payment of ₱3,680.00 received. Thank you!
  Your official receipt OR-2024-00789 has been
  sent to your email. - YourClinic
  ```

**Alternative - Insurance Payment:**

If Maria had insurance:

1. Staff verifies insurance coverage
2. Submits claim to insurance
3. Maria pays co-payment (if any)
4. Invoice marked as "Partially Paid - Insurance Pending"
5. When insurance pays:
   - System records insurance payment
   - Updates invoice to "Paid"
   - Generates insurance receipt

---

## Step 7: Follow-up Scheduled

### Scenario
Doctor recommends follow-up visit to review lab results and check headache improvement.

### Actions

**Before Maria Leaves:**

**Staff at Billing/Reception:**

1. Informs Maria: "Doctor recommends follow-up in 2 weeks"
2. Opens scheduling calendar
3. Shows available slots
4. Maria selects: "Two weeks from today, 3:00 PM"
5. Creates appointment:
   - Patient: Maria Santos
   - Doctor: Dr. Dela Cruz
   - Type: Follow-up Visit
   - Reason: Review lab results, assess headache improvement
6. Confirms booking

**System Actions:**
- Creates follow-up appointment
- Sends confirmation email
- Sends confirmation SMS
- Sets reminders (24 hours before)
- Links to original visit

**Maria's Summary Card (Given at checkout):**
```
VISIT SUMMARY

Patient: Maria Santos
Visit Date: [Today's Date]
Doctor: Dr. Juan Dela Cruz, MD

DIAGNOSIS:
- Tension-type headache

MEDICATIONS PRESCRIBED:
- Ibuprofen 400mg: Take 1 tablet every 6 hours as needed
- Multivitamin: Take 1 tablet daily after breakfast

LAB TESTS ORDERED:
- Complete Blood Count (CBC)
- Fasting Blood Sugar (FBS)
- Lipid Panel
* Please return tomorrow morning for blood draw (fasting)

RECOMMENDATIONS:
- Take regular breaks from computer work
- Practice good posture
- Stay hydrated
- Get adequate sleep

FOLLOW-UP APPOINTMENT:
Date: [Two weeks from today]
Time: 3:00 PM
Doctor: Dr. Dela Cruz

TOTAL PAID: ₱3,680.00

Questions? Call us at: [Clinic Phone]
```

---

## Step 8: Between Visits (Automated Engagement)

### Days After Visit

**Day 1 (Next Morning):**
- Maria returns for lab blood draw
- Quick process, no appointment needed
- Shows lab request form
- Blood drawn, done in 10 minutes

**Day 3:**
- Lab results available
- System notifies Maria via SMS and email
- Maria logs into patient portal
- Views results (all normal)
- Doctor added note: "Results normal, continue current treatment"

**Day 7 (One Week Before Follow-up):**
- Maria receives health reminder:
  ```
  Hi Maria, you have a follow-up appointment with Dr. Dela Cruz
  next week on [date] at 3:00 PM. See you then! - YourClinic
  ```

**Day 13 (24 Hours Before Follow-up):**
- Appointment reminder sent:
  ```
  Reminder: Tomorrow at 3:00 PM, you have a follow-up with
  Dr. Dela Cruz. Reply CANCEL to cancel. - YourClinic
  ```

**Maria's Birthday (Months Later):**
- Birthday greeting:
  ```
  Happy Birthday Maria! Wishing you health and happiness.
  Schedule your annual checkup when you're ready. - YourClinic
  ```

---

## Step 9: Follow-up Visit

### Two Weeks Later

**Maria Returns:**

1. Checks in (same process as before)
2. Shorter wait time (follow-up patients prioritized)
3. Sees Dr. Dela Cruz

**Doctor Reviews:**
- Previous visit notes
- Lab results (all normal)
- Prescription history
- Asks about headaches:
  - "Much better! Rare now."
  - "Taking breaks helps a lot"
  - "Medications worked well"

**Doctor Documents:**
- Headaches improved significantly
- Lab results reviewed with patient (all normal)
- Continue current management
- Reinforce lifestyle modifications
- No new prescriptions needed
- No need for immediate follow-up
- "Return if symptoms recur"

**Billing:**
- Follow-up consultation: ₱800.00
- Maria pays
- Receives receipt

**Maria Leaves:**
- Satisfied with care
- Headaches resolved
- Knows to return if needed
- Has clinic's contact info

---

## System Benefits Demonstrated

### For Maria (Patient):
✅ Easy online booking
✅ Multiple reminders (never forgets appointment)
✅ Quick check-in with QR code
✅ Minimal wait time with queue system
✅ Complete medical records accessible online
✅ Clear prescriptions and instructions
✅ Easy follow-up scheduling
✅ Transparent billing
✅ Ongoing engagement and care

### For Clinic Staff:
✅ Automated reminders reduce no-shows
✅ Efficient check-in process
✅ Organized queue management
✅ Complete patient information at fingertips
✅ Integrated workflow (visit → prescription → labs → billing)
✅ Automatic inventory updates
✅ Streamlined billing
✅ Comprehensive reporting

### For Doctor:
✅ Patient history readily available
✅ Previous visit notes accessible
✅ Lab results integrated
✅ Quick prescription creation
✅ Drug interaction checking
✅ Easy documentation
✅ Follow-up tracking
✅ Complete continuity of care

---

## Key Touchpoints Summary

1. **Pre-Visit:** Booking, confirmation, reminders
2. **Arrival:** Check-in, queue management
3. **Clinical:** Vitals, consultation, documentation
4. **Treatment:** Prescriptions, lab orders
5. **Financial:** Billing, payment, receipts
6. **Post-Visit:** Lab follow-up, reminders, portal access
7. **Follow-up:** Scheduled visit, continuity of care

---

## Related Documentation

- [Getting Started](GETTING_STARTED.md)
- [Patient Management](PATIENT_MANAGEMENT.md)
- [Appointment Scheduling](APPOINTMENT_SCHEDULING.md)
- [Queue Management](QUEUE_MANAGEMENT.md)
- [Clinical Visits](CLINICAL_VISITS.md)
- [Prescriptions](EPRESCRIPTION.md)
- [Billing and Payments](BILLING_PAYMENTS.md)
