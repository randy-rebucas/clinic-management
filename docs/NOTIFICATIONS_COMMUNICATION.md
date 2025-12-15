# Notifications & Communication System

This document describes the Notifications & Communication features implemented in MyClinicSoft.

## Features Overview

### 1. SMS Reminders

The system uses Twilio for SMS functionality to send appointment reminders and notifications.

**Configuration:**
- Environment variables required:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`

**Features:**
- Appointment reminders (24 hours before)
- Booking confirmations
- Lab result notifications
- Follow-up reminders
- Custom SMS messages

**API Endpoints:**
- `POST /api/appointments/reminders/sms` - Send SMS reminder for specific appointment
- `GET /api/appointments/reminders/sms` - Auto-send reminders for upcoming appointments
- `POST /api/lab-results/[id]/notify` - Send SMS notification for lab results

**Usage:**
```javascript
import { sendSMS } from '@/lib/sms';

const result = await sendSMS({
  to: '+1234567890',
  message: 'Your appointment is tomorrow at 10:00 AM',
});
```

### 2. In-App Notifications

Real-time in-app notifications for users within the system.

**Notification Model:**
```typescript
{
  user: ObjectId,              // User who receives the notification
  type: NotificationType,      // appointment, visit, prescription, lab_result, invoice, reminder, system, broadcast
  priority: Priority,          // low, normal, high, urgent
  title: string,
  message: string,
  relatedEntity: {             // Optional link to related entity
    type: string,
    id: ObjectId
  },
  actionUrl: string,            // Optional URL for action
  read: boolean,
  readAt: Date,
  metadata: object,            // Additional data
  expiresAt: Date,             // Optional expiration
  createdAt: Date,
  updatedAt: Date
}
```

**API Endpoints:**
- `GET /api/notifications` - Get user's notifications
  - Query params: `read` (true/false), `type`, `limit`
- `POST /api/notifications` - Create notification (admin only)
- `GET /api/notifications/[id]` - Get notification details
- `PUT /api/notifications/[id]` - Update notification (mark as read)
- `DELETE /api/notifications/[id]` - Delete notification
- `POST /api/notifications/mark-all-read` - Mark all notifications as read
- `GET /api/notifications/unread-count` - Get unread notification count

**Helper Functions:**
```javascript
import {
  createNotification,
  createAppointmentReminderNotification,
  createLabResultNotification,
  createPrescriptionNotification,
  createInvoiceNotification,
} from '@/lib/notifications';

// Create custom notification
await createNotification({
  userId: user._id,
  type: 'appointment',
  priority: 'normal',
  title: 'Appointment Reminder',
  message: 'Your appointment is tomorrow at 10:00 AM',
  relatedEntity: {
    type: 'appointment',
    id: appointment._id,
  },
  actionUrl: `/appointments/${appointment._id}`,
});

// Create appointment reminder notification
await createAppointmentReminderNotification(userId, appointment);

// Create lab result notification
await createLabResultNotification(userId, labResult);
```

**Features:**
- Automatic expiration (TTL index)
- Priority levels
- Read/unread status
- Related entity linking
- Action URLs for quick navigation

### 3. Email Notifications

Email notifications using Nodemailer with SMTP configuration.

**Configuration:**
- Environment variables required:
  - `SMTP_HOST` - SMTP server host
  - `SMTP_PORT` - SMTP server port (e.g., 587, 465)
  - `SMTP_USER` - SMTP username
  - `SMTP_PASS` - SMTP password
  - `SMTP_FROM` - From email address (optional, defaults to SMTP_USER)

**Features:**
- Appointment reminders
- Lab result notifications
- Invoice/payment notifications
- Custom email templates
- HTML email support

**Email Templates:**
- `generateAppointmentReminderEmail()` - Appointment reminder template
- `generateLabResultEmail()` - Lab result notification template

**Usage:**
```javascript
import { sendEmail, generateAppointmentReminderEmail } from '@/lib/email';

// Send appointment reminder
const emailContent = generateAppointmentReminderEmail(appointment);
await sendEmail({
  to: patient.email,
  subject: emailContent.subject,
  html: emailContent.html,
});

// Send custom email
await sendEmail({
  to: 'patient@example.com',
  subject: 'Custom Subject',
  html: '<h1>Custom HTML Content</h1>',
  text: 'Plain text version',
  cc: ['cc@example.com'],
  attachments: [{
    filename: 'document.pdf',
    path: '/path/to/document.pdf',
  }],
});
```

**API Integration:**
- Email notifications are automatically sent when:
  - Lab results are available (`POST /api/lab-results/[id]/notify`)
  - Appointment reminders are triggered
  - Custom notifications are created

### 4. Broadcast Messages to Patients

Send messages to multiple patients via SMS, email, and/or in-app notifications.

**API Endpoint:** `POST /api/communications/broadcast`

**Access:** Admin only

**Request Body:**
```json
{
  "title": "Important Announcement",
  "message": "The clinic will be closed on December 25th for the holiday.",
  "channels": ["sms", "email", "in-app"],
  "filters": {
    "city": "Manila",
    "hasInsurance": true,
    "ageGroup": "18-65"
  }
}
```

**Channels:**
- `sms` - Send SMS to patients with phone numbers
- `email` - Send email to patients with email addresses
- `in-app` - Create in-app notifications for patients with user accounts

**Filters:**
- `city` - Filter by patient city
- `hasInsurance` - Filter by insurance status
- `ageGroup` - Filter by age group (future enhancement)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPatients": 100,
    "smsSent": 95,
    "emailSent": 90,
    "inAppCreated": 80,
    "errors": []
  },
  "message": "Broadcast sent to 100 patients"
}
```

**Features:**
- Multi-channel delivery (SMS, email, in-app)
- Patient filtering
- Error tracking
- Batch processing

## Integration Examples

### Creating Notifications for Appointments

```javascript
// When appointment is created
import { createAppointmentReminderNotification } from '@/lib/notifications';
import { sendSMS } from '@/lib/sms';
import { sendEmail, generateAppointmentReminderEmail } from '@/lib/email';

// Find user account for patient
const User = await import('@/models/User');
const user = await User.default.findOne({ email: patient.email });

// Create in-app notification
if (user) {
  await createAppointmentReminderNotification(user._id, appointment);
}

// Send SMS
if (patient.phone) {
  await sendSMS({
    to: patient.phone,
    message: `Reminder: Appointment on ${appointmentDate} at ${appointmentTime}`,
  });
}

// Send email
if (patient.email) {
  const emailContent = generateAppointmentReminderEmail(appointment);
  await sendEmail({
    to: patient.email,
    subject: emailContent.subject,
    html: emailContent.html,
  });
}
```

### Creating Notifications for Lab Results

```javascript
// When lab result is available
import { createLabResultNotification } from '@/lib/notifications';

const user = await User.findOne({ email: patient.email });
if (user) {
  await createLabResultNotification(user._id, labResult);
}
```

### Sending Broadcast Messages

```javascript
// Admin sends broadcast
const response = await fetch('/api/communications/broadcast', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Clinic Holiday Notice',
    message: 'The clinic will be closed on December 25th.',
    channels: ['sms', 'email', 'in-app'],
    filters: {
      city: 'Manila',
    },
  }),
});
```

## Notification Types

1. **appointment** - Appointment-related notifications
2. **visit** - Visit-related notifications
3. **prescription** - Prescription-related notifications
4. **lab_result** - Lab result notifications
5. **invoice** - Invoice/payment notifications
6. **reminder** - General reminders
7. **system** - System notifications
8. **broadcast** - Broadcast messages

## Priority Levels

1. **low** - Low priority notifications
2. **normal** - Normal priority (default)
3. **high** - High priority notifications
4. **urgent** - Urgent notifications

## Auto-Expiration

Notifications can have an `expiresAt` field. The system uses MongoDB TTL index to automatically delete expired notifications.

## Environment Variables

### SMS (Twilio)
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

### Email (SMTP)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@clinic.com
```

## Future Enhancements

- Push notifications (web push, mobile)
- Notification preferences per user
- Scheduled notifications
- Notification templates
- Rich notifications with images
- Notification grouping
- Real-time updates via WebSocket
- Notification history/archive
- Delivery status tracking
- Read receipts
- Notification analytics

