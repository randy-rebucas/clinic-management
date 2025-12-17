# Automation Quick Test Reference

Quick reference for testing all 19 automations.

## 🚀 Quick Start Testing

### 1. Environment Check
```bash
# Verify environment variables
echo $CRON_SECRET
echo $TWILIO_ACCOUNT_SID
echo $SMTP_HOST
```

### 2. Enable All Automations
```javascript
// In MongoDB or via API
db.settings.updateOne(
  {},
  { $set: { 
    "automationSettings": {
      "autoInvoiceGeneration": true,
      "autoPaymentReminders": true,
      "autoLowStockAlerts": true,
      "autoLabNotifications": true,
      "autoExpiryMonitoring": true,
      "autoAppointmentConfirmation": true,
      "autoPrescriptionRefills": true,
      "autoFollowupScheduling": true,
      "autoDailyReports": true,
      "autoWelcomeMessages": true,
      "autoVisitSummaries": true,
      "autoNoShowHandling": true,
      "autoWaitlistManagement": true,
      "autoBirthdayGreetings": true,
      "autoHealthReminders": true,
      "autoFeedbackCollection": true,
      "autoRecurringAppointments": true,
      "autoMedicationAdherence": true,
      "autoBroadcastMessaging": true
    }
  }}
)
```

---

## 📋 Quick Test Commands

### Event-Triggered Automations

#### 1. Invoice Generation
```bash
# Close a visit
curl -X PUT "http://localhost:3000/api/visits/{visitId}" \
  -H "Content-Type: application/json" \
  -d '{"status": "closed"}'
# Check: Invoice created, email sent
```

#### 2. Lab Result Notifications
```bash
# Complete a lab result
curl -X PUT "http://localhost:3000/api/lab-results/{labResultId}" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
# Check: Patient and doctor notified
```

#### 3. Welcome Messages
```bash
# Create new patient
curl -X POST "http://localhost:3000/api/patients" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "Patient",
    "email": "test@example.com",
    "phone": "+1234567890",
    "dateOfBirth": "1990-01-01"
  }'
# Check: Welcome SMS/email sent
```

#### 4. Visit Summary
```bash
# Close visit (same as #1)
# Check: Visit summary email sent
```

#### 5. Follow-up Scheduling
```bash
# Close visit with follow-up date
curl -X PUT "http://localhost:3000/api/visits/{visitId}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "closed",
    "followUpDate": "2024-02-15"
  }'
# Check: Follow-up appointment created
```

#### 6. Waitlist Management
```bash
# Cancel appointment
curl -X PUT "http://localhost:3000/api/appointments/{appointmentId}" \
  -H "Content-Type: application/json" \
  -d '{"status": "cancelled"}'
# Check: Waitlist patient gets slot
```

---

### Cron Job Automations

#### 7. Payment Reminders
```bash
curl -X GET "http://localhost:3000/api/cron/payment-reminders" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Reminders sent for overdue invoices
```

#### 8. Inventory Alerts
```bash
curl -X GET "http://localhost:3000/api/cron/inventory-alerts" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Low stock alerts sent
```

#### 9. Expiry Monitoring
```bash
curl -X GET "http://localhost:3000/api/cron/expiry-monitoring" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Expiry alerts sent
```

#### 10. Prescription Refills
```bash
curl -X GET "http://localhost:3000/api/cron/prescription-refills" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Refill reminders sent
```

#### 11. Follow-up Scheduling (Cron)
```bash
curl -X GET "http://localhost:3000/api/cron/followup-scheduling" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Follow-up appointments created
```

#### 12. Daily Reports
```bash
curl -X GET "http://localhost:3000/api/cron/daily-reports" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Daily report generated and emailed
```

#### 13. No-Show Handling
```bash
curl -X GET "http://localhost:3000/api/cron/no-show-handling" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: No-shows marked and patients notified
```

#### 14. Waitlist Management (Cron)
```bash
curl -X GET "http://localhost:3000/api/cron/waitlist-management" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Cancelled slots filled from waitlist
```

#### 15. Birthday Greetings
```bash
curl -X GET "http://localhost:3000/api/cron/birthday-greetings" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Birthday messages sent
```

#### 16. Health Reminders
```bash
curl -X GET "http://localhost:3000/api/cron/health-reminders" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Health check reminders sent
```

#### 17. Feedback Collection
```bash
curl -X GET "http://localhost:3000/api/cron/feedback-collection" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Feedback requests sent
```

#### 18. Recurring Appointments
```bash
curl -X GET "http://localhost:3000/api/cron/recurring-appointments" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Next appointments in series created
```

#### 19. Medication Reminders
```bash
curl -X GET "http://localhost:3000/api/cron/medication-reminders" \
  -H "Authorization: Bearer $CRON_SECRET"
# Check: Medication reminders sent
```

---

## 🔍 Verification Checklist

After running each automation, verify:

- [ ] Database records created/updated correctly
- [ ] SMS sent (if phone available)
- [ ] Email sent (if email available)
- [ ] In-app notification created
- [ ] No errors in logs
- [ ] Correct tenant isolation (if multi-tenant)

---

## 📊 Test Data Setup

### Create Test Patient
```javascript
{
  "firstName": "Test",
  "lastName": "Patient",
  "email": "test@example.com",
  "phone": "+1234567890",
  "dateOfBirth": "1990-01-01", // For birthday test, use today's date
  "active": true
}
```

### Create Test Appointment
```javascript
{
  "patient": "{patientId}",
  "appointmentDate": "2024-01-15", // Use past date for no-show test
  "appointmentTime": "10:00",
  "status": "scheduled"
}
```

### Create Test Visit
```javascript
{
  "patient": "{patientId}",
  "date": "2024-01-15",
  "status": "open",
  "diagnoses": [{"code": "Z00.00", "description": "General exam"}]
}
```

### Create Test Invoice
```javascript
{
  "patient": "{patientId}",
  "visit": "{visitId}",
  "totalAmount": 1000,
  "balance": 1000, // Outstanding balance
  "dueDate": "2024-01-01" // Past date for payment reminder
}
```

### Create Test Prescription
```javascript
{
  "patient": "{patientId}",
  "medications": [{
    "name": "Test Medication",
    "frequency": "BID", // Twice daily
    "durationDays": 7
  }],
  "status": "active"
}
```

---

## 🐛 Debugging

### Check Logs
```bash
# Application logs
tail -f logs/app.log

# Error logs
grep -i error logs/app.log
```

### Database Queries
```javascript
// Check notifications
db.notifications.find().sort({ createdAt: -1 }).limit(10)

// Check invoices
db.invoices.find().sort({ createdAt: -1 }).limit(10)

// Check appointments
db.appointments.find().sort({ createdAt: -1 }).limit(10)

// Check settings
db.settings.findOne({}, { automationSettings: 1 })
```

### Common Issues

1. **Cron not running**
   - Check `CRON_SECRET` is set
   - Verify authentication header

2. **Notifications not sending**
   - Check SMS/Email credentials
   - Verify patient contact info
   - Check automation is enabled

3. **Automation not triggering**
   - Check automation setting is enabled
   - Verify tenant context
   - Check database connection

---

## ✅ Testing Priority

### Must Test (High Priority)
1. Invoice Generation
2. Payment Reminders
3. Low Stock Alerts
4. Lab Result Notifications
5. Expiry Monitoring

### Should Test (Medium Priority)
6. Appointment Confirmation
7. Prescription Refills
8. Follow-up Scheduling
9. Daily Reports

### Nice to Test (Low Priority)
10-19. All other automations

---

## 📝 Notes

- Test in development/staging first
- Use test data, not production data
- Monitor error logs during testing
- Verify multi-tenant isolation if applicable
- Test with different patient configurations
- Verify email/SMS delivery

