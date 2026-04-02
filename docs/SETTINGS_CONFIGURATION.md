# Settings and Configuration

The Settings page lets administrators configure system-wide preferences for billing, appointments, notifications, and more. Changes take effect immediately across the entire clinic.

> **Admin or Owner role required** to access Settings.

---

## Accessing Settings

Go to **Settings** in the sidebar.

---

## Billing Settings

Configure how invoices are generated and displayed.

| Setting | Description |
|---|---|
| **Currency** | The currency symbol used on invoices (e.g., PHP, USD, EUR) |
| **Tax / VAT Rate** | Percentage added to invoice totals (set to 0 to disable) |
| **Invoice Prefix** | Text prefix for invoice numbers (e.g., "INV-" produces INV-00001) |
| **Invoice Starting Number** | The first invoice number (useful when migrating from another system) |
| **Payment Terms** | Default due date for invoices (e.g., Due on Receipt, Net 30) |
| **PWD Discount Rate** | Percentage discount applied to patients marked as PWD-eligible |
| **Senior Citizen Discount Rate** | Percentage discount applied to patients marked as senior-eligible |

---

## Appointment Settings

Configure scheduling defaults.

| Setting | Description |
|---|---|
| **Default Appointment Duration** | Length in minutes for new appointments if not specified (e.g., 30) |
| **Appointment Reminder Lead Time** | How many hours/days before an appointment a reminder is sent |
| **Allow Walk-ins** | Toggle walk-in appointment creation |
| **Auto-assign Queue Number** | Automatically assign queue numbers to walk-in appointments |
| **Cancellation Policy** | The period within which cancellations are flagged (e.g., 24 hours) |

---

## Notification Settings

Configure how and when alerts are sent.

| Setting | Description |
|---|---|
| **Email Notifications** | Enable or disable outgoing email |
| **SMS Notifications** | Enable or disable outgoing SMS (requires Twilio configuration) |
| **Push Notifications** | Enable or disable browser/PWA push notifications |
| **Appointment Reminder** | Enable automated appointment reminder emails/SMS |
| **Lab Result Notification** | Notify patients when lab results are ready |
| **Low Stock Alert** | Send alerts when inventory falls below reorder level |
| **Expiry Alert Window** | Number of days before expiry to trigger an expiry alert |

---

## SMTP / Email Configuration

To send emails from the system, configure your SMTP server:

| Setting | Description |
|---|---|
| **SMTP Host** | Your mail server host (e.g., smtp.gmail.com) |
| **SMTP Port** | Usually 587 (TLS) or 465 (SSL) |
| **SMTP User** | Email address used to send messages |
| **SMTP Password** | App-specific password for the email account |
| **From Name** | Display name shown in outgoing emails (e.g., "My Clinic") |
| **From Email** | Sender address (e.g., noreply@myclinic.com) |

> For Gmail, use an App Password, not your regular Gmail password. Enable 2-Step Verification first, then generate an App Password in your Google Account Security settings.

---

## SMS Configuration (Twilio)

To enable SMS notifications:

| Setting | Description |
|---|---|
| **Twilio Account SID** | Found in your Twilio Console dashboard |
| **Twilio Auth Token** | Found in your Twilio Console dashboard |
| **Twilio Phone Number** | The SMS-capable number purchased in Twilio |

---

## Clinic Information

Set the clinic details shown on printed documents (invoices, prescriptions, referral letters, certificates).

| Setting | Description |
|---|---|
| **Clinic Name** | Full clinic name |
| **Address** | Street address |
| **City / Province** | City and province or state |
| **Phone** | Clinic contact number |
| **Email** | Clinic contact email |
| **License Number** | PhilHealth or DOH accreditation number (if applicable) |
| **Logo** | Upload a clinic logo for printed documents |

---

## Report Settings

| Setting | Description |
|---|---|
| **Default Report Period** | The default time period shown when opening Reports (Today, Week, Month) |
| **Fiscal Year Start** | Month the financial year begins |

---

## Subscription

View your current subscription plan, usage limits, and billing information. To upgrade or renew:

1. Go to **Subscription** in the sidebar.
2. Review your current plan and usage.
3. Click **Upgrade** or **Renew** and follow the PayPal checkout process.

---

## Tips

- After changing SMTP settings, use the **Send Test Email** button to verify the configuration before relying on it for patient notifications.
- The currency setting affects display only — no currency conversion is performed. Set it to match the currency your clinic bills in.
- Keep your clinic information up to date, as it appears on all printed documents given to patients.
- If you change the invoice prefix, existing invoices are not affected. Only new invoices will use the updated prefix.
