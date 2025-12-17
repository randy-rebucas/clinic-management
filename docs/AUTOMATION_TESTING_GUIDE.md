# Automation Testing Guide

This guide will help you test all the automations that have been implemented in MyClinicSoft.

## 🧪 Testing Overview

### Prerequisites
1. **Environment Setup**
   - Ensure all environment variables are configured:
     - `CRON_SECRET` - For cron job authentication
     - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` - For SMS
     - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - For email
     - `NEXT_PUBLIC_APP_URL` - Base URL for links in notifications

2. **Database**
   - Ensure MongoDB is running and connected
   - Have test data ready (patients, appointments, visits, prescriptions, etc.)

3. **Settings**
   - Verify automation settings are enabled in Settings model
   - Check tenant configuration if using multi-tenant setup

---

## 📋 Testing Checklist

### High Priority Automations

#### 1. ✅ Automatic Invoice Generation
**Test Steps:**
1. Create a visit with status "open"
2. Add services/procedures to the visit
3. Update visit status to "closed"
4. **Expected:** Invoice should be automatically created
5. **Verify:**
   - Invoice exists in database
   - Invoice includes all visit services
   - Discounts are applied correctly (if applicable)
   - Email notification sent to patient (if enabled)

**Manual Test:**
```bash
# Update a visit to closed status
PUT /api/visits/{visitId}
{
  "status": "closed"
}
```

**Check:**
- Invoice created with correct total
- Patient receives email notification
- In-app notification created

---

#### 2. ✅ Payment Reminder Automation
**Test Steps:**
1. Create an invoice with outstanding balance
2. Set invoice `dueDate` to 7, 14, or 30 days ago
3. Run cron job manually or wait for scheduled time
4. **Expected:** Payment reminder sent to patient
5. **Verify:**
   - SMS sent (if phone available)
   - Email sent (if email available)
   - In-app notification created
   - Different urgency levels for different overdue periods

**Manual Test:**
```bash
# Trigger payment reminders cron
GET /api/cron/payment-reminders
Authorization: Bearer {CRON_SECRET}
```

**Check:**
- Reminders sent for overdue invoices
- Correct urgency level based on days overdue
- Multiple channels (SMS, email, notification)

---

#### 3. ✅ Low Stock Alerts
**Test Steps:**
1. Create inventory item with low quantity (below reorder level)
2. Update inventory item status
3. **Expected:** Alert sent to inventory managers
4. **Verify:**
   - Alert triggered when quantity drops below reorder level
   - Alert triggered when status changes to "low-stock" or "out-of-stock"
   - Notifications sent to appropriate staff

**Manual Test:**
```bash
# Update inventory item to low stock
PUT /api/inventory/{itemId}
{
  "quantity": 5,
  "reorderLevel": 10
}
```

**Check:**
- Immediate alert on status change
- Daily cron job also checks and alerts

---

#### 4. ✅ Lab Result Notifications
**Test Steps:**
1. Create a lab result with status "pending"
2. Update lab result status to "completed"
3. **Expected:** Notifications sent to patient and doctor
4. **Verify:**
   - Patient receives notification
   - Doctor receives notification
   - Email sent with lab result details
   - In-app notifications created

**Manual Test:**
```bash
# Update lab result to completed
PUT /api/lab-results/{labResultId}
{
  "status": "completed"
}
```

**Check:**
- Patient notification
- Doctor notification
- Email with lab details

---

#### 5. ✅ Expiry Date Monitoring
**Test Steps:**
1. Create inventory items with expiry dates:
   - 30 days from now
   - 7 days from now
   - 1 day from now
   - Already expired
2. Run expiry monitoring cron
3. **Expected:** Alerts sent for items expiring soon
4. **Verify:**
   - Different alert levels for different timeframes
   - Expired items flagged

**Manual Test:**
```bash
# Trigger expiry monitoring cron
GET /api/cron/expiry-monitoring
Authorization: Bearer {CRON_SECRET}
```

**Check:**
- Alerts for items expiring in 30 days
- Alerts for items expiring in 7 days
- Urgent alerts for items expiring in 1 day
- Alerts for expired items

---

### Medium Priority Automations

#### 6. ✅ Appointment Confirmation Automation
**Test Steps:**
1. Create an appointment
2. Send confirmation request
3. Patient clicks confirmation link
4. **Expected:** Appointment status updated
5. **Verify:**
   - Confirmation SMS/email sent
   - Link works correctly
   - Status updates properly

**Manual Test:**
```bash
# Send confirmation request (integrate with appointment creation)
# Patient clicks link:
GET /api/appointments/{appointmentId}/confirm?status=confirmed
```

**Check:**
- Confirmation link works
- Status updates correctly
- Patient notified

---

#### 7. ✅ Prescription Refill Reminders
**Test Steps:**
1. Create prescription with end date
2. Set end date to 3 days, 1 day, or today
3. Run prescription refills cron
4. **Expected:** Refill reminders sent
5. **Verify:**
   - Reminders sent at correct intervals
   - Multiple reminders for same prescription

**Manual Test:**
```bash
# Trigger prescription refills cron
GET /api/cron/prescription-refills
Authorization: Bearer {CRON_SECRET}
```

**Check:**
- Reminders for prescriptions ending in 3 days
- Reminders for prescriptions ending in 1 day
- Reminders for prescriptions ending today

---

#### 8. ✅ Follow-up Visit Scheduling
**Test Steps:**
1. Create a visit with follow-up date
2. Close the visit
3. **Expected:** Follow-up appointment created automatically
4. **Verify:**
   - Appointment created with correct date
   - Patient notified
   - Appointment linked to original visit

**Manual Test:**
```bash
# Close visit with follow-up date
PUT /api/visits/{visitId}
{
  "status": "closed",
  "followUpDate": "2024-02-15"
}
```

**Check:**
- Follow-up appointment created
- Patient receives notification
- Appointment scheduled correctly

---

#### 9. ✅ Daily Reports Generation
**Test Steps:**
1. Wait for end of day (11:00 PM) or trigger manually
2. **Expected:** Daily report generated and sent
3. **Verify:**
   - Report includes daily statistics
   - Report sent to admins/accountants
   - Report includes appointments, visits, revenue

**Manual Test:**
```bash
# Trigger daily reports cron
GET /api/cron/daily-reports
Authorization: Bearer {CRON_SECRET}
```

**Check:**
- Report generated
- Email sent to admins
- Report includes correct statistics

---

### Low Priority Automations

#### 10. ✅ Welcome Message Automation
**Test Steps:**
1. Create a new patient (via API or UI)
2. **Expected:** Welcome message sent automatically
3. **Verify:**
   - SMS sent (if phone provided)
   - Email sent (if email provided)
   - Message includes patient code and booking link

**Manual Test:**
```bash
# Create new patient
POST /api/patients
{
  "firstName": "Test",
  "lastName": "Patient",
  "email": "test@example.com",
  "phone": "+1234567890",
  "dateOfBirth": "1990-01-01"
}
```

**Check:**
- Welcome SMS sent
- Welcome email sent
- Patient code included
- Booking link included

---

#### 11. ✅ Visit Summary Automation
**Test Steps:**
1. Create and close a visit with diagnosis, prescriptions, lab orders
2. **Expected:** Visit summary sent to patient
3. **Verify:**
   - Summary includes all visit details
   - Prescriptions listed
   - Lab orders listed
   - Follow-up information included

**Manual Test:**
```bash
# Close visit
PUT /api/visits/{visitId}
{
  "status": "closed"
}
```

**Check:**
- Visit summary email sent
- All visit details included
- Links to prescriptions and lab results

---

#### 12. ✅ No-Show Handling
**Test Steps:**
1. Create appointment with past date/time
2. Set status to "scheduled" or "confirmed"
3. Run no-show handling cron
4. **Expected:** Appointment marked as no-show and patient notified
5. **Verify:**
   - Status changed to "no-show"
   - Patient receives apology and rescheduling offer

**Manual Test:**
```bash
# Trigger no-show handling cron
GET /api/cron/no-show-handling
Authorization: Bearer {CRON_SECRET}
```

**Check:**
- Past appointments marked as no-show
- Patients notified
- Rescheduling offers sent

---

#### 13. ✅ Waitlist Management
**Test Steps:**
1. Add patient to waitlist
2. Cancel an appointment
3. **Expected:** Waitlist patient automatically gets the slot
4. **Verify:**
   - New appointment created for waitlist patient
   - Patient notified of available slot
   - Patient removed from waitlist

**Manual Test:**
```bash
# Add to waitlist
POST /api/waitlist
{
  "patientId": "...",
  "doctorId": "...",
  "preferredDate": "2024-02-15"
}

# Cancel appointment
PUT /api/appointments/{appointmentId}
{
  "status": "cancelled"
}
```

**Check:**
- Waitlist patient gets appointment
- Patient notified
- Waitlist updated

---

#### 14. ✅ Birthday Greetings
**Test Steps:**
1. Create patient with today's date as birthday
2. Run birthday greetings cron
3. **Expected:** Birthday greeting sent
4. **Verify:**
   - Birthday message sent
   - Special discount offer included
   - Booking link included

**Manual Test:**
```bash
# Trigger birthday greetings cron
GET /api/cron/birthday-greetings
Authorization: Bearer {CRON_SECRET}
```

**Check:**
- Patients with today's birthday receive greetings
- Discount offer included
- Booking link included

---

#### 15. ✅ Health Check Reminders
**Test Steps:**
1. Create patient without recent check-up
2. Run health reminders cron
3. **Expected:** Health check reminder sent
4. **Verify:**
   - Reminder sent for annual check-up
   - Age-appropriate screenings suggested

**Manual Test:**
```bash
# Trigger health reminders cron
GET /api/cron/health-reminders
Authorization: Bearer {CRON_SECRET}
```

**Check:**
- Reminders for patients needing check-ups
- Age-based recommendations
- Booking links included

---

#### 16. ✅ Feedback Collection
**Test Steps:**
1. Create visit and close it
2. Wait 1-2 days or adjust visit date
3. Run feedback collection cron
4. **Expected:** Feedback request sent
5. **Verify:**
   - Feedback link sent
   - Link works correctly
   - Patient can submit feedback

**Manual Test:**
```bash
# Trigger feedback collection cron
GET /api/cron/feedback-collection
Authorization: Bearer {CRON_SECRET}
```

**Check:**
- Feedback requests sent for visits 1-2 days old
- Feedback links work
- Patient can submit feedback

---

#### 17. ✅ Recurring Appointment Creation
**Test Steps:**
1. Complete an appointment with recurring indicator in notes
2. Run recurring appointments cron
3. **Expected:** Next appointment in series created
4. **Verify:**
   - New appointment created with correct date
   - Patient notified
   - Series continues correctly

**Manual Test:**
```bash
# Complete appointment with recurring note
PUT /api/appointments/{appointmentId}
{
  "status": "completed",
  "notes": "Recurring monthly appointment"
}

# Trigger recurring appointments cron
GET /api/cron/recurring-appointments
Authorization: Bearer {CRON_SECRET}
```

**Check:**
- Next appointment created
- Correct frequency applied
- Patient notified

---

#### 18. ✅ Medication Adherence Tracking
**Test Steps:**
1. Create active prescription with frequency (BID, TID, etc.)
2. Run medication reminders cron at appropriate times
3. **Expected:** Medication reminders sent
4. **Verify:**
   - Reminders sent at correct times
   - Multiple reminders per day if needed
   - Medication details included

**Manual Test:**
```bash
# Trigger medication reminders cron
GET /api/cron/medication-reminders
Authorization: Bearer {CRON_SECRET}
```

**Check:**
- Reminders sent at 8 AM, 12 PM, 4 PM, 8 PM
- Correct medications for each time
- Patient receives reminders

---

#### 19. ✅ Broadcast Messaging
**Test Steps:**
1. Send broadcast message to patient group
2. **Expected:** Message sent to all targeted patients
3. **Verify:**
   - Correct patients receive message
   - Multiple channels (SMS, email, notification)
   - Delivery tracking works

**Manual Test:**
```bash
# Send broadcast message
POST /api/broadcast
Authorization: Bearer {AUTH_TOKEN}
{
  "message": "Test broadcast message",
  "subject": "Test Subject",
  "targetGroup": {
    "type": "all"
  },
  "sendSMS": true,
  "sendEmail": true,
  "sendNotification": true
}
```

**Check:**
- Message sent to all active patients
- Multiple channels used
- Delivery results tracked

---

## 🔧 Testing Tools

### Manual Cron Trigger
For testing cron jobs manually, you can use:

```bash
# Using curl
curl -X GET "http://localhost:3000/api/cron/{cron-endpoint}" \
  -H "Authorization: Bearer {CRON_SECRET}"

# Using Postman
GET http://localhost:3000/api/cron/{cron-endpoint}
Headers:
  Authorization: Bearer {CRON_SECRET}
```

### Environment Variables Check
```bash
# Check if all required env vars are set
echo $CRON_SECRET
echo $TWILIO_ACCOUNT_SID
echo $SMTP_HOST
```

### Database Queries
```javascript
// Check if automations are enabled
db.settings.findOne({}, { automationSettings: 1 })

// Check recent notifications
db.notifications.find().sort({ createdAt: -1 }).limit(10)

// Check recent invoices
db.invoices.find().sort({ createdAt: -1 }).limit(10)
```

---

## 🐛 Common Issues & Solutions

### Issue: Cron jobs not running
**Solution:**
- Check `CRON_SECRET` is set
- Verify Vercel cron configuration (if deployed)
- Check cron job authentication

### Issue: Notifications not sending
**Solution:**
- Verify SMS/Email credentials
- Check patient contact information
- Verify automation is enabled in settings
- Check logs for errors

### Issue: Automation not triggering
**Solution:**
- Check automation is enabled in Settings
- Verify tenant context is correct
- Check database connection
- Review error logs

---

## 📊 Testing Results Template

Use this template to track your testing:

```
Automation: [Name]
Date: [Date]
Tester: [Name]

✅ Pass / ❌ Fail

Test Steps:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Results:
- [Result 1]
- [Result 2]
- [Result 3]

Issues Found:
- [Issue 1]
- [Issue 2]

Notes:
[Additional notes]
```

---

## 🚀 Next Steps After Testing

1. **Fix any issues found**
2. **Document any configuration needed**
3. **Update settings if defaults need adjustment**
4. **Train staff on new automations**
5. **Monitor automation performance in production**

---

## 📝 Notes

- Test in development/staging environment first
- Use test patient data
- Verify email/SMS delivery
- Check database records are created correctly
- Monitor error logs during testing
- Test with different tenant configurations (if multi-tenant)

