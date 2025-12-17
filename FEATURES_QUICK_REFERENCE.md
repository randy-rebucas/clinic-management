# MyClinicSoft - Quick Reference Guide

**Version:** 1.0  
**Quick lookup guide for common features and operations**

---

## 🚀 Quick Navigation

### Core Operations

| Task | Page | API Endpoint |
|------|------|--------------|
| View Dashboard | `/` | `GET /api/reports/dashboard` |
| Add Patient | `/patients/new` | `POST /api/patients` |
| View Patient | `/patients/[id]` | `GET /api/patients/[id]` |
| Schedule Appointment | `/appointments/new` | `POST /api/appointments` |
| View Appointments | `/appointments` | `GET /api/appointments` |
| Create Visit | `/visits/new` | `POST /api/visits` |
| Create Prescription | `/prescriptions` | `POST /api/prescriptions` |
| Create Invoice | `/invoices/new` | `POST /api/invoices` |
| View Queue | `/queue` | `GET /api/queue` |

---

## 📋 Common Workflows

### Patient Registration → Visit → Invoice Flow

1. **Register Patient**
   - Go to `/patients/new`
   - Fill patient information
   - Save → Patient created

2. **Schedule Appointment**
   - Go to `/appointments/new`
   - Select patient, doctor, date/time
   - Save → Appointment scheduled
   - SMS reminder sent automatically (24h before)

3. **Create Visit**
   - Go to `/visits/new`
   - Select patient and appointment
   - Enter clinical notes, vitals, diagnosis
   - Save → Visit created

4. **Create Prescription** (if needed)
   - Go to `/prescriptions`
   - Select patient and visit
   - Add medications
   - System checks drug interactions automatically
   - Save → Prescription created

5. **Close Visit**
   - Edit visit → Change status to "closed"
   - **Invoice automatically generated** (if enabled)
   - Visit summary sent to patient

6. **Record Payment**
   - Go to `/invoices/[id]`
   - Click "Record Payment"
   - Enter payment details
   - Save → Payment recorded, receipt generated

---

### Inventory Management Flow

1. **Add Inventory Item**
   - Go to `/inventory/new`
   - Enter medicine/supply details
   - Set reorder level
   - Save → Item added

2. **Low Stock Alert** (Automatic)
   - When stock ≤ reorder level
   - Alert sent to admins automatically
   - Notification appears in dashboard

3. **Restock**
   - Go to `/inventory/[id]/restock`
   - Enter quantity and batch info
   - Save → Stock updated

4. **Expiry Monitoring** (Automatic)
   - Daily cron checks expiry dates
   - Alerts at 30, 7, and 1 day before expiry
   - Notifications sent automatically

---

### Lab Results Flow

1. **Create Lab Request**
   - During visit, click "Generate Lab Request"
   - Or go to `/lab-results/new`
   - Select patient and tests
   - Print request form

2. **Upload Results**
   - Go to `/lab-results/[id]`
   - Upload result files
   - Enter test values
   - Change status to "completed"

3. **Automatic Notification**
   - When status = "completed"
   - Patient and doctor notified automatically
   - SMS and email sent

---

## 🔑 Key Features by Role

### Admin
- ✅ Full system access
- ✅ User management
- ✅ Settings configuration
- ✅ Reports and analytics
- ✅ Subscription management
- ✅ Audit logs

### Doctor
- ✅ View patients
- ✅ Create visits
- ✅ Write prescriptions
- ✅ View lab results
- ✅ View appointments
- ✅ Digital signatures

### Nurse
- ✅ View patients
- ✅ Assist with visits
- ✅ View prescriptions
- ✅ View lab results
- ✅ Queue management

### Receptionist
- ✅ Register patients
- ✅ Schedule appointments
- ✅ Manage queue
- ✅ View appointments
- ✅ Check-in patients

### Accountant
- ✅ View invoices
- ✅ Record payments
- ✅ Generate receipts
- ✅ Financial reports
- ✅ Outstanding balances

---

## ⚡ Automation Quick Reference

| Automation | Trigger | Frequency | Action |
|------------|---------|-----------|--------|
| Invoice Generation | Visit closed | Instant | Creates invoice with discounts |
| Payment Reminders | Overdue invoices | Daily 10 AM | Sends reminders (7, 14, 30 days) |
| Low Stock Alerts | Stock ≤ reorder level | Instant + Daily 8 AM | Alerts admins |
| Lab Notifications | Lab result completed | Instant | Notifies patient & doctor |
| Expiry Monitoring | Expiry approaching | Daily 7 AM | Alerts at 30/7/1 days |
| Appointment Reminders | 24h before appointment | Daily | SMS/Email reminders |
| Prescription Refills | Refill due | Daily | Reminds patient |
| Follow-up Scheduling | Visit with follow-up | Instant | Creates appointment |
| Daily Reports | End of day | Daily 9 PM | Sends summary to admins |
| Welcome Messages | New patient | Instant | Sends welcome SMS/Email |
| Visit Summaries | Visit completed | Instant | Sends summary to patient |
| No-Show Handling | Appointment no-show | Instant | Sends rescheduling options |
| Birthday Greetings | Patient birthday | Daily | Sends birthday message |
| Health Reminders | Scheduled | Configurable | Sends health check reminders |

---

## 📊 Subscription Plans Quick Reference

| Feature | Trial | Basic | Professional | Enterprise |
|---------|-------|-------|--------------|------------|
| **Price** | Free | $29/mo | $79/mo | $199/mo |
| **Patients** | 50 | 100 | 500 | Unlimited |
| **Users** | 3 | 5 | 15 | Unlimited |
| **Doctors** | 2 | 3 | 10 | Unlimited |
| **Appointments/Month** | 100 | 500 | 2,000 | Unlimited |
| **Storage** | 1 GB | 5 GB | 20 GB | Unlimited |
| **Reports** | ❌ | ✅ | ✅ | ✅ |
| **API Access** | ❌ | ❌ | ✅ | ✅ |
| **Custom Reports** | ❌ | ❌ | ✅ | ✅ |
| **White Label** | ❌ | ❌ | ❌ | ✅ |
| **SSO** | ❌ | ❌ | ❌ | ✅ |

---

## 🔍 Search & Filter Tips

### Patients
- Search by: Name, Email, Phone, Patient Code
- Filter by: Status, Date Registered, Age Group

### Appointments
- Filter by: Date, Doctor, Patient, Status
- View: Calendar or List view

### Visits
- Filter by: Date, Doctor, Patient, Diagnosis
- Search by: Visit Code, Patient Name

### Invoices
- Filter by: Status (Paid, Unpaid, Overdue), Date Range
- Search by: Invoice Number, Patient Name

### Inventory
- Filter by: Status (In Stock, Low Stock, Out of Stock, Expired)
- Search by: Medicine Name, Batch Number

---

## 🎯 Common Status Values

### Appointment Status
- `scheduled` - Appointment is scheduled
- `confirmed` - Patient confirmed
- `completed` - Appointment completed
- `cancelled` - Appointment cancelled
- `no-show` - Patient didn't show up

### Visit Status
- `open` - Visit started
- `in-progress` - Visit in progress
- `closed` - Visit completed
- `cancelled` - Visit cancelled

### Invoice Status
- `draft` - Invoice not finalized
- `pending` - Invoice pending payment
- `paid` - Invoice fully paid
- `partial` - Partial payment received
- `overdue` - Payment overdue
- `cancelled` - Invoice cancelled

### Prescription Status
- `active` - Prescription active
- `completed` - Prescription completed
- `cancelled` - Prescription cancelled
- `refilled` - Prescription refilled

### Lab Result Status
- `pending` - Test pending
- `in-progress` - Test in progress
- `completed` - Test completed
- `cancelled` - Test cancelled

### Inventory Status
- `in-stock` - Item in stock
- `low-stock` - Stock below reorder level
- `out-of-stock` - Item out of stock
- `expired` - Item expired

---

## 🔐 Permission Quick Reference

### Resource Permissions
- `patients` - Patient management
- `appointments` - Appointment management
- `visits` - Visit management
- `prescriptions` - Prescription management
- `lab-results` - Lab result management
- `invoices` - Invoice management
- `inventory` - Inventory management
- `doctors` - Doctor management
- `reports` - Report access

### Action Permissions
- `read` - View records
- `write` - Create records
- `update` - Edit records
- `delete` - Delete records

---

## 📱 Patient Portal Features

### What Patients Can Do
- ✅ View profile
- ✅ View appointments
- ✅ Book appointments
- ✅ View visit history
- ✅ View prescriptions
- ✅ View lab results
- ✅ View invoices
- ✅ View documents
- ✅ Download documents
- ✅ Cancel appointments
- ✅ Request refills

### Patient Login Methods
1. **QR Code Login** - Scan QR code from clinic
2. **Email/Password** - Traditional login

---

## 🛠️ Settings Quick Reference

### Business Settings
- Business hours
- Timezone
- Currency
- Date format

### Communication Settings
- SMS (Twilio) configuration
- Email (SMTP) configuration
- Notification preferences

### Automation Settings
- Auto invoice generation
- Auto payment reminders
- Auto appointment reminders
- Auto lab notifications
- Auto stock alerts

### Branding Settings
- Logo upload
- Primary color
- Secondary color
- Custom branding

---

## 🚨 Alert & Notification Types

### Patient Alerts
- Allergies
- Medications
- Pre-existing conditions
- Critical lab values

### System Alerts
- Low stock items
- Expiring inventory
- Overdue invoices
- Upcoming appointments
- Subscription limits

### Notification Types
- `info` - Informational
- `warning` - Warning
- `error` - Error
- `success` - Success

---

## 📞 Support & Help

### Documentation
- Knowledge Base: `/knowledge-base`
- Feature Docs: `docs/` directory

### Common Issues

**Can't create patient?**
- Check subscription limits (max patients)
- Check user permissions

**Invoice not generating?**
- Check automation settings
- Ensure visit status is "closed"

**SMS not sending?**
- Check Twilio configuration
- Verify phone number format

**Email not sending?**
- Check SMTP configuration
- Verify email settings

---

## 💡 Pro Tips

1. **Use Keyboard Shortcuts**
   - Quick navigation with sidebar
   - Use search for fast patient lookup

2. **Bulk Operations**
   - Export data for bulk updates
   - Use filters for batch operations

3. **Automation**
   - Enable automations to save time
   - Configure automation settings per tenant

4. **Reports**
   - Schedule reports for regular delivery
   - Export reports for external analysis

5. **Patient Portal**
   - Encourage patients to use portal
   - Reduces front desk workload

6. **Queue Management**
   - Use QR codes for check-in
   - Display queue on TV screens

7. **Inventory**
   - Set appropriate reorder levels
   - Monitor expiry dates regularly

8. **Prescriptions**
   - Always check drug interactions
   - Use prescription templates

---

## 🔗 Quick Links

- **Main Dashboard**: `/`
- **Patients**: `/patients`
- **Appointments**: `/appointments`
- **Visits**: `/visits`
- **Prescriptions**: `/prescriptions`
- **Lab Results**: `/lab-results`
- **Invoices**: `/invoices`
- **Inventory**: `/inventory`
- **Queue**: `/queue`
- **Reports**: `/reports`
- **Settings**: `/settings`
- **Subscription**: `/subscription`
- **Knowledge Base**: `/knowledge-base`

---

**For detailed information, see `FEATURES_DOCUMENTATION.md`**

