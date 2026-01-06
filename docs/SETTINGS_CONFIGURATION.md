# Settings and Configuration

Complete guide to configuring MyClinicSoft for your clinic's specific needs.

## Overview

The Settings page provides comprehensive configuration options for:
- Clinic Information
- User Preferences
- System Settings
- Integration Configuration
- Notification Settings
- Security Settings
- Backup Configuration

**Access:** Navigate to **Settings** from the sidebar (Admin access required for most settings)

## General Settings

### Clinic Information

**Location:** Settings → General → Clinic Information

Configure your clinic's basic information:

**Clinic Details:**
- **Clinic Name*** (required)
  - Example: "Smith Family Medical Center"
  - Appears on: Invoices, prescriptions, documents, emails
  
- **Clinic Registration Number**
  - Business/DTI registration number
  - For official documents
  
- **Tax ID/TIN**
  - Tax Identification Number
  - For billing and invoices

**Contact Information:**
- **Phone Number*** (required)
  - Primary contact number
  - Format: +639171234567
  
- **Email Address*** (required)
  - Primary email for notifications
  - Used as reply-to in emails
  
- **Website**
  - Your clinic website URL
  - Example: https://www.yourclinic.com
  
- **Address**
  - Street Address*
  - City*
  - Province/State*
  - Postal Code
  - Country*

**Operating Hours:**

Set hours for each day:
- Monday: 8:00 AM - 5:00 PM
- Tuesday: 8:00 AM - 5:00 PM
- Wednesday: 8:00 AM - 5:00 PM
- Thursday: 8:00 AM - 5:00 PM
- Friday: 8:00 AM - 5:00 PM
- Saturday: 9:00 AM - 12:00 PM
- Sunday: Closed

**Lunch Break:**
- Start: 12:00 PM
- End: 1:00 PM
- Apply to all days (yes/no)

**Holidays:**
- Add clinic holidays
- Date range
- Reason (New Year, Christmas, etc.)
- Recurring (yes/no)

### Branding

**Logo:**
- Upload clinic logo
- Recommended: 300x100 pixels, PNG with transparent background
- Appears on: Headers, invoices, prescriptions, emails

**Colors:**
- Primary Color: Brand color for buttons and highlights
- Secondary Color: Accent color
- Preview before saving

**Letterhead:**
- Upload letterhead template for official documents
- Format: PDF or Image
- Used for: Medical certificates, official letters

## Appointment Settings

**Location:** Settings → Appointments

### Scheduling Configuration

**Default Settings:**
- **Default Appointment Duration**
  - 15, 30, 45, 60 minutes
  - Default: 30 minutes
  
- **Appointment Interval**
  - Time between appointments
  - Default: Same as duration
  
- **Buffer Time**
  - Extra time between appointments
  - Default: 0 minutes
  - Recommendation: 5-10 minutes
  
- **Booking Window**
  - How far in advance patients can book
  - Example: 30 days, 60 days, 90 days
  - Default: 30 days
  
- **Same Day Booking**
  - Allow/disallow same-day appointments
  - If allowed, cutoff time (e.g., 2 hours before)

**Appointment Types:**
- Add custom appointment types
- Set duration for each type
- Set pricing for each type
- Examples:
  - New Patient Consultation (60 min)
  - Follow-up Visit (30 min)
  - Procedure (45 min)
  - Emergency (15 min)

### Public Booking

**Enable Public Booking:** Yes/No

**Public Booking Settings:**
- **Require Approval**
  - Yes: Staff must approve bookings
  - No: Auto-confirm bookings
  
- **Show Doctor Photos:** Yes/No
- **Show Doctor Credentials:** Yes/No
- **Show Available Slots:** Yes/No
- **Allow Doctor Selection:** Yes/No (or auto-assign)

**Required Fields:**
- ☑ Name
- ☑ Phone
- ☑ Email
- ☐ Date of Birth
- ☐ Address
- ☑ Reason for Visit

**Booking Confirmation:**
- Send email confirmation
- Send SMS confirmation
- Redirect to confirmation page

### Reminders

**Appointment Reminders:**

**First Reminder:**
- Enable: ☑ Yes
- Timing: 24 hours before
- Method: SMS + Email
- Template: Customize message

**Second Reminder:**
- Enable: ☑ Yes
- Timing: 2 hours before
- Method: SMS only
- Template: Customize message

**Cancellation Reminders:**
- Notify patient of cancellation
- Offer to reschedule
- Method: SMS + Email

### No-Show Policies

**No-Show Settings:**
- **Grace Period:** 15 minutes (patient late = no-show)
- **Tracking:** Enable no-show tracking

**Automated Actions:**
- After 1 no-show: Send reminder about importance of appointments
- After 3 no-shows: Flag patient, send warning
- After 5 no-shows: Require deposit for future appointments

**Deposit Requirement:**
- Enable: Yes/No
- Amount: Fixed amount or percentage
- Refund policy: Full refund if attended

## Clinical Settings

**Location:** Settings → Clinical

### Visit Documentation

**Default Templates:**
- Select default template for new visits
- Create custom templates by specialty
- Set required fields

**Required Fields:**
- ☑ Chief Complaint
- ☑ Vital Signs
- ☐ History of Present Illness
- ☐ Physical Examination
- ☑ Assessment
- ☑ Plan

**Diagnosis:**
- Enable ICD-10 coding: ☑ Yes
- Require diagnosis code: Yes/No
- Allow custom diagnoses: Yes/No (with approval)

**Clinical Notes:**
- Auto-save frequency: Every 2 minutes
- Enable voice-to-text: Yes/No
- Enable clinical templates: Yes/No

### Prescriptions

**E-Prescription Settings:**

**General:**
- Enable e-prescriptions: ☑ Yes
- Require doctor digital signature: ☑ Yes
- Check drug interactions: ☑ Yes
- Warn on allergy conflicts: ☑ Yes

**Controlled Substances:**
- Enable special logging: ☑ Yes
- Require dual authorization: Yes/No
- Electronic submission to authorities: Yes/No

**Prescription Format:**
- Include clinic logo: ☑ Yes
- Include doctor credentials: ☑ Yes
- Include patient photo: ☐ No
- Include QR code for verification: ☑ Yes

**Default Instructions:**
- Add common dosing instructions
- Examples:
  - "Take with food"
  - "Take on empty stomach"
  - "Do not crush or chew"
  - "Complete full course"

### Lab Results

**Lab Integration:**
- Enable third-party lab integration: Yes/No
- API endpoint: (if applicable)
- API key: (if applicable)

**Result Notification:**
- Notify doctor when results available: ☑ Yes
- Auto-notify patient: After doctor review/Immediately
- Notification method: SMS + Email

**Critical Results:**
- Define critical value ranges
- Immediate notification for critical results
- Escalation process

## Billing Settings

**Location:** Settings → Billing

### Invoice Configuration

**Invoice Settings:**
- **Invoice Prefix:** INV-
- **Starting Number:** 0001
- **Number Format:** INV-YYYY-XXXX
- **Reset Annually:** Yes/No

**Payment Terms:**
- Default terms: Due upon receipt
- Custom terms: 15 days, 30 days, etc.
- Late fee: Fixed amount or percentage

**Currency:**
- Currency: PHP (₱) / USD ($) / EUR (€)
- Display format: ₱1,234.56
- Decimal places: 2

**Tax Settings:**
- Enable tax: Yes/No
- Tax rate: 12% (VAT)
- Tax label: "VAT"
- Inclusive or exclusive pricing

### Payment Methods

**Accepted Payment Methods:**
- ☑ Cash
- ☑ Credit/Debit Card
- ☑ Bank Transfer
- ☑ Check
- ☑ Insurance
- ☐ PayPal
- ☐ GCash (Philippines)
- ☐ PayMaya (Philippines)

**Payment Gateway:**
- Enable online payments: Yes/No
- Provider: Stripe, PayPal, PayMongo, etc.
- API keys: (configure separately)
- Transaction fee: Who pays?

### Insurance

**Insurance Settings:**
- Enable insurance billing: Yes/No
- Accepted insurance providers: (add list)
- Require pre-authorization: Yes/No
- Claim submission method: Electronic/Manual

## Inventory Settings

**Location:** Settings → Inventory

### Stock Management

**General Settings:**
- Enable inventory module: ☑ Yes
- Allow negative stock: ☐ No
- Reorder level threshold: 20% of optimal level
- Expiration alert days: 30 days

**Valuation Method:**
- FIFO (First In, First Out) - Recommended
- LIFO (Last In, First Out)
- Average Cost
- Specific Identification

**Stock Adjustments:**
- Require approval for adjustments: Yes/No
- Approval threshold: Adjustments > ₱1,000
- Dual authorization required: Yes/No

### Suppliers

**Supplier Management:**
- Add default suppliers
- Set preferred suppliers per item
- Track supplier performance

**Purchase Orders:**
- PO prefix: PO-
- Require approval: Yes/No
- Approval threshold: >₱10,000
- Auto-email to supplier: Yes/No

### Reordering

**Auto-Reorder:**
- Enable automatic reordering: Yes/No
- Check frequency: Daily
- Create draft PO or send immediately: Draft
- Notify admin: Yes

**Reorder Calculation:**
- Based on: Average consumption
- Look-back period: 30 days
- Safety stock: 25% extra
- Supplier lead time: 7 days

## Notification Settings

**Location:** Settings → Notifications

### SMS Configuration

**Twilio Settings:**
- Account SID: (from .env.local)
- Auth Token: (from .env.local)
- Phone Number: (from .env.local)
- Enable SMS: ☑ Yes

**SMS Settings:**
- Character limit: 160 (single SMS)
- Long message handling: Split/Truncate
- Delivery reports: Enable
- Retry failed: Yes (3 attempts)

### Email Configuration

**SMTP Settings:**
- Host: (from .env.local)
- Port: (from .env.local)
- Username: (from .env.local)
- Password: (from .env.local)
- From email: (from .env.local)
- From name: Clinic name

**Email Settings:**
- Send HTML emails: ☑ Yes
- Include plain text version: ☑ Yes
- Track email opens: Yes/No
- Enable unsubscribe link: ☑ Yes

### Notification Preferences

**Enable/Disable Each Type:**

**Appointments:**
- ☑ Appointment confirmation
- ☑ Appointment reminder (24h)
- ☑ Appointment reminder (2h)
- ☑ Appointment cancelled
- ☑ Appointment rescheduled

**Clinical:**
- ☑ Lab results ready
- ☑ Prescription ready
- ☐ Prescription refill reminder

**Billing:**
- ☑ Payment received
- ☑ Payment reminder
- ☐ Invoice generated

**General:**
- ☑ Birthday greetings
- ☐ Health reminders
- ☐ Vaccination reminders

**For Each Notification:**
- Method: SMS, Email, or Both
- Timing: When to send
- Template: Customize message

## Queue Settings

**Location:** Settings → Queue

### Queue Configuration

**General:**
- Enable queue system: ☑ Yes
- Auto-check-in from appointments: ☑ Yes
- Grace period before auto-check-in: 15 minutes
- Auto-remove after X calls: 3

**Queue Display:**
- Display format: Full name/First name/Queue number
- Show estimated wait time: ☑ Yes
- Show queue position: ☑ Yes
- Auto-refresh interval: 10 seconds

**QR Code Check-in:**
- Enable QR code check-in: ☑ Yes
- QR code expiration: 24 hours
- Include in appointment confirmation: ☑ Yes

## Document Settings

**Location:** Settings → Documents

### Document Management

**Storage:**
- Provider: Cloudinary
- Configure: (links to Cloudinary setup)

**Upload Settings:**
- Max file size (documents): 10 MB
- Max file size (images): 5 MB
- Allowed file types:
  - ☑ PDF
  - ☑ DOC/DOCX
  - ☑ JPG/PNG
  - ☑ XLS/XLSX
  - ☐ Other (specify)

**Document Privacy:**
- Default visibility: Private
- URL expiration time: 1 hour
- Require authentication to view: ☑ Yes

**Categories:**
- Define document categories
- Add custom categories
- Set category-specific settings

## Security Settings

**Location:** Settings → Security

### Authentication

**Password Policy:**
- Minimum length: 8 characters
- Require uppercase: ☑ Yes
- Require lowercase: ☑ Yes
- Require numbers: ☑ Yes
- Require special characters: ☑ Yes
- Password expiration: 90 days
- Remember last passwords: 5

**Session Management:**
- Session timeout: 60 minutes of inactivity
- Allow multiple sessions: No
- Require re-authentication for sensitive actions: Yes

**Two-Factor Authentication:**
- Enable 2FA: Optional/Required/Disabled
- Methods: SMS, Email, Authenticator App

### Access Control

**User Permissions:**
- Configure role-based permissions
- Define custom roles
- Set resource-level permissions

**IP Restrictions:**
- Enable IP whitelisting: Yes/No
- Allowed IP addresses: (list)
- Block suspicious IPs: ☑ Yes

**Audit Logging:**
- Enable audit logs: ☑ Yes
- Log level: All/Important actions only
- Retention period: 365 days
- Alert on suspicious activity: ☑ Yes

### Data Privacy

**Compliance:**
- PH DPA compliance mode: ☑ Enabled
- GDPR compliance mode: ☐ Enabled
- HIPAA compliance mode: ☐ Enabled

**Data Retention:**
- Patient records: Indefinite
- Deleted records: 30 days before permanent deletion
- Audit logs: 2 years
- Session logs: 90 days

**Data Export:**
- Allow patient data export: ☑ Yes
- Export format: PDF, CSV
- Include audit trail: Yes

## Backup Settings

**Location:** Settings → Backup

### Automated Backups

**Database Backups:**
- Enable auto-backup: ☑ Yes
- Frequency: Daily
- Time: 2:00 AM
- Retention: Keep last 30 days

**Backup Location:**
- Local storage
- Cloud storage (AWS S3, Google Cloud)
- Email backup file: Yes (for small databases)

**What to Backup:**
- ☑ Patient records
- ☑ Appointments
- ☑ Clinical notes
- ☑ Invoices
- ☑ Inventory
- ☑ User data
- ☐ Audit logs (large file)

### Manual Backup

**On-Demand Backup:**
- Click "Backup Now" for immediate backup
- Download backup file
- Store securely

**Restore:**
- Upload backup file
- Select restore point
- Confirm restoration

## Integration Settings

**Location:** Settings → Integrations

### Third-Party Integrations

**Laboratory Systems:**
- Enable lab integration: Yes/No
- Lab system: (select provider)
- API endpoint
- API key
- Test connection

**Imaging Systems:**
- Enable imaging integration: Yes/No
- PACS integration: Yes/No
- Configuration: (specific to system)

**Pharmacy Systems:**
- Enable pharmacy integration: Yes/No
- E-prescription submission: Yes/No
- Real-time inventory sync: Yes/No

**Accounting Software:**
- Enable accounting sync: Yes/No
- Provider: QuickBooks, Xero, etc.
- Sync frequency: Daily
- What to sync: Invoices, payments

### API Configuration

**API Access:**
- Enable API: Yes/No
- Generate API key
- API documentation: Link to docs
- Rate limiting: 1000 requests/hour

## Advanced Settings

**Location:** Settings → Advanced

### System Configuration

**Performance:**
- Enable caching: ☑ Yes
- Cache duration: 1 hour
- Enable compression: ☑ Yes

**Maintenance Mode:**
- Enable maintenance mode: ☐ No
- Display message: "System under maintenance"
- Allowed IPs: (admin IPs only)

**Debug Mode:**
- Enable debug mode: ☐ No (only for development)
- Log level: Error/Warning/Info/Debug
- Display errors: No (in production)

### Customization

**Date and Time:**
- Timezone: Asia/Manila
- Date format: MM/DD/YYYY
- Time format: 12-hour / 24-hour

**Language:**
- Default language: English
- Available languages: English, Filipino
- Allow user language selection: Yes

**Measurements:**
- Temperature: Celsius / Fahrenheit
- Weight: Kilograms / Pounds
- Height: Centimeters / Inches

## Saving Settings

**Important:**
- Click "Save Changes" at bottom of each section
- Changes take effect immediately (except some requiring restart)
- Settings are logged in audit trail
- Only admins can change most settings

## Backing Up Settings

**Export Settings:**
- Settings → Advanced → Export Configuration
- Saves all settings to JSON file
- Use to replicate settings in another installation
- Store securely

**Import Settings:**
- Settings → Advanced → Import Configuration
- Upload saved settings file
- Review changes before applying
- Confirm import

## Related Documentation

- [Getting Started](GETTING_STARTED.md)
- [SMS and Email Setup](SMS_AND_EMAIL_SETUP.md)
- [Cloudinary Setup](CLOUDINARY_DOCUMENT_STORAGE.md)
- [Security and Compliance](SECURITY_COMPLIANCE.md)
- [User Roles and Permissions](ROLES_PERMISSIONS.md)
