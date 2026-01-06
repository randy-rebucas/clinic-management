# SMS and Email Setup

Complete guide to configuring SMS (Twilio) and Email (SMTP) notifications in MyClinicSoft.

## Overview

MyClinicSoft supports sending notifications via:
- **SMS** - Using Twilio integration
- **Email** - Using SMTP configuration

Notifications can be sent for:
- Appointment reminders
- Payment reminders  
- Lab result notifications
- Birthday greetings
- Health reminders
- Medication reminders
- And more

## SMS Setup (Twilio)

### What is Twilio?

Twilio is a cloud communications platform that allows applications to send SMS messages programmatically.

### Prerequisites

1. A Twilio account (sign up at [twilio.com](https://www.twilio.com))
2. A Twilio phone number
3. Account credentials (Account SID and Auth Token)

### Step 1: Create Twilio Account

1. Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Sign up for a free account
3. Verify your email address
4. Verify your phone number

**Free Trial:**
- $15 credit (approximately 1,000 SMS)
- Can only send to verified numbers
- Messages include "Sent from a Twilio trial account"

**Paid Account:**
- Remove trial limitations
- Send to any number
- No trial message prefix
- Volume discounts available

### Step 2: Get a Phone Number

1. Log in to Twilio console
2. Go to **Phone Numbers** → **Buy a Number**
3. Select your country
4. Choose capabilities:
   - ✅ SMS
   - ✅ MMS (optional)
   - ⬜ Voice (not needed)
5. Search for available numbers
6. Purchase a number

**Costs:**
- Philippines: ~$1-2/month per number
- USA: ~$1/month per number
- Outgoing SMS: ~$0.0075 per message (varies by country)

### Step 3: Get Account Credentials

1. Go to Twilio Console Dashboard
2. Find your credentials:
   - **Account SID** - Starts with "AC"
   - **Auth Token** - Click to reveal

**Keep These Secret!** Never share or commit to version control.

### Step 4: Configure MyClinicSoft

Add to your `.env.local` file:

```env
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

**Format Notes:**
- Account SID: Starts with "AC" followed by 32 characters
- Auth Token: 32-character string
- Phone Number: International format with +, no spaces or dashes
  - Example: +639171234567 (Philippines)
  - Example: +14155551234 (USA)

### Step 5: Test SMS

1. Restart your application:
   ```bash
   npm run dev
   ```

2. Test sending SMS:
   - Go to **Appointments**
   - Create a test appointment
   - Click **Send Reminder**
   - Check if SMS received

**Troubleshooting:**
- Check phone number format (must include country code)
- Verify credentials are correct
- Check Twilio console logs
- Ensure phone number is verified (if trial account)

### SMS Best Practices

1. **Message Length** - Keep under 160 characters
2. **Timing** - Send during appropriate hours (8 AM - 8 PM)
3. **Opt-out** - Include opt-out instructions
4. **Cost** - Monitor usage to control costs
5. **Compliance** - Follow local SMS regulations

### SMS Message Templates

Customize in **Settings** → **Notifications** → **SMS Templates**

**Available Variables:**
- `{patientName}` - Patient's name
- `{doctorName}` - Doctor's name
- `{appointmentDate}` - Date of appointment
- `{appointmentTime}` - Time of appointment
- `{clinicName}` - Your clinic name
- `{clinicPhone}` - Your clinic phone

**Example Appointment Reminder:**
```
Hi {patientName}, this is a reminder of your appointment with Dr. {doctorName} 
tomorrow at {appointmentTime}. Reply CANCEL to cancel. - {clinicName}
```

## Email Setup (SMTP)

### What is SMTP?

SMTP (Simple Mail Transfer Protocol) is the standard protocol for sending emails.

### Email Provider Options

Choose one:

#### Option 1: Gmail (Recommended for Small Clinics)

**Pros:**
- Free for low volume
- Reliable
- Easy setup

**Cons:**
- 500 emails/day limit
- Requires App Password

**Setup:**
1. Enable 2-factor authentication on Gmail
2. Generate App Password:
   - Go to Google Account → Security
   - Click "App passwords"
   - Select "Mail" and your device
   - Copy generated password
3. Use these settings:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your_app_password_here
SMTP_FROM=your-email@gmail.com
```

#### Option 2: SendGrid

**Pros:**
- 100 emails/day free
- Professional service
- Good deliverability
- Detailed analytics

**Cons:**
- Requires signup

**Setup:**
1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Create API key
3. Verify sender identity
4. Use these settings:

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
SMTP_FROM=your-verified-email@yourdomain.com
```

#### Option 3: Amazon SES

**Pros:**
- Very cheap ($0.10 per 1,000 emails)
- Scalable
- Reliable

**Cons:**
- More complex setup
- Requires AWS account

**Setup:**
1. Create AWS account
2. Verify email address/domain
3. Create SMTP credentials
4. Request production access (exit sandbox)

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM=your-verified-email@yourdomain.com
```

#### Option 4: Your Own Email Server

If you have your own email server:

```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your_email_password
SMTP_FROM=noreply@yourdomain.com
```

**Common Ports:**
- 587 - TLS (recommended)
- 465 - SSL
- 25 - Unencrypted (not recommended)

### Configure MyClinicSoft

Add to your `.env.local` file:

```env
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM=noreply@yourclinic.com
```

### Test Email

1. Restart your application
2. Test sending email:
   - Go to **Appointments**
   - Create test appointment with your email
   - Click **Send Reminder**
   - Check if email received

**Check Spam Folder** if not received in inbox.

### Email Best Practices

1. **Professional From Address** - Use your domain, not Gmail
2. **Clear Subject Lines** - Indicate purpose clearly
3. **Plain Text + HTML** - Support both formats
4. **Unsubscribe Link** - Allow patients to opt out
5. **DKIM/SPF** - Configure for better deliverability
6. **Test Before Sending** - Always test new templates

### Email Templates

Customize in **Settings** → **Notifications** → **Email Templates**

**Template Components:**
- Subject line
- HTML body
- Plain text body
- Header/Footer

**Available Variables:**
Same as SMS templates plus:
- `{clinicAddress}` - Your clinic address
- `{clinicWebsite}` - Your website URL
- `{unsubscribeLink}` - Opt-out link

**Example Appointment Reminder:**

Subject: `Appointment Reminder - {appointmentDate}`

Body:
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; }
        .header { background-color: #007bff; color: white; padding: 20px; }
        .content { padding: 20px; }
        .footer { background-color: #f8f9fa; padding: 10px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{clinicName}</h1>
    </div>
    <div class="content">
        <p>Dear {patientName},</p>
        <p>This is a reminder of your upcoming appointment:</p>
        <ul>
            <li><strong>Doctor:</strong> Dr. {doctorName}</li>
            <li><strong>Date:</strong> {appointmentDate}</li>
            <li><strong>Time:</strong> {appointmentTime}</li>
        </ul>
        <p>If you need to cancel or reschedule, please call us at {clinicPhone}.</p>
        <p>Thank you!</p>
    </div>
    <div class="footer">
        <p>{clinicName} | {clinicAddress} | {clinicPhone}</p>
        <p><a href="{unsubscribeLink}">Unsubscribe</a></p>
    </div>
</body>
</html>
```

## Notification Settings

Configure notifications in **Settings** → **Notifications**

### General Settings

- **Enable Notifications** - Master on/off switch
- **Default Send Method** - SMS, Email, or Both
- **Quiet Hours** - Don't send between 10 PM - 7 AM
- **Rate Limiting** - Max messages per hour/day
- **Retry Failed** - Retry failed sends (yes/no)

### Notification Types

Enable/disable each notification type:

**Appointment Notifications:**
- ✅ Appointment confirmation (immediately)
- ✅ Appointment reminder (24 hours before)
- ✅ Appointment reminder (2 hours before)
- ✅ Appointment cancelled
- ⬜ Appointment rescheduled

**Payment Notifications:**
- ✅ Payment received
- ✅ Payment reminder (7 days overdue)
- ✅ Payment reminder (14 days overdue)
- ⬜ Payment plan reminder

**Clinical Notifications:**
- ✅ Lab results ready
- ✅ Prescription ready for pickup
- ⬜ Prescription refill reminder

**General Notifications:**
- ✅ Birthday greetings
- ⬜ Health reminders
- ⬜ Vaccination reminders
- ⬜ Annual checkup reminder

### Patient Preferences

Patients can control their notification preferences:

**Patient Portal Settings:**
- Choose notification method (SMS/Email/Both)
- Opt out of certain types
- Update contact information
- Unsubscribe from all

## Automated Notifications

### Cron Jobs

Automated notifications run via cron jobs:

**Configured Notifications:**
- Appointment reminders (daily at 9 AM)
- Payment reminders (daily at 10 AM)
- Birthday greetings (daily at 8 AM)
- Health reminders (daily at 12 PM)
- Medication reminders (4x daily)

See [Cron Job Setup](CRON_SETUP.md) for configuration details.

### Manual Sending

Send notifications manually:

**Single Patient:**
1. Go to patient record
2. Click **Send Notification**
3. Choose type and method
4. Edit message if needed
5. Click **Send**

**Bulk Sending:**
1. Go to **Notifications** → **Send Bulk**
2. Select recipients:
   - All patients
   - Patients with appointments today
   - Patients with upcoming birthdays
   - Custom filter
3. Choose notification type
4. Preview message
5. Click **Send to All**

## Monitoring and Logs

### Notification History

View sent notifications:

**Access:** **Notifications** → **History**

**View:**
- Date and time sent
- Recipient
- Type (SMS/Email)
- Status (Sent/Failed/Pending)
- Error message (if failed)

**Filter By:**
- Date range
- Patient
- Type
- Status
- Method

### Delivery Status

**SMS Status:**
- Sent - Delivered to carrier
- Delivered - Confirmed delivery
- Failed - Not delivered
- Undelivered - Invalid number

**Email Status:**
- Sent - Sent from server
- Delivered - Received by recipient
- Opened - Email opened (if tracking enabled)
- Bounced - Invalid email
- Spam - Marked as spam

### Failed Notifications

Handle failed notifications:

1. Go to **Notifications** → **Failed**
2. Review failures
3. For each:
   - Check error message
   - Verify contact information
   - Correct if needed
   - Retry sending

**Common Failure Reasons:**
- Invalid phone number/email
- Recipient blocked sender
- Network error
- Quota exceeded
- Credentials invalid

## Cost Management

### Monitoring Costs

**Twilio Costs:**
- View usage in Twilio console
- Set up usage alerts
- Monitor spending daily

**SendGrid/SES:**
- View dashboard analytics
- Set budget alerts
- Monitor monthly totals

### Reducing Costs

1. **Batch Messages** - Send at optimal times
2. **Opt-in Only** - Only send to those who want them
3. **Consolidate** - Combine multiple notifications
4. **Email When Possible** - Email is cheaper than SMS
5. **Remove Inactive** - Remove patients who never respond
6. **Shorten Messages** - Keep SMS under 160 characters

### Usage Reports

Generate usage reports:

**Navigate to:** **Reports** → **Notifications**

**Reports:**
- Messages sent by type
- Messages sent by method
- Cost by period
- Delivery rate
- Response rate

## Compliance

### Privacy Regulations

**PH DPA / GDPR Compliance:**
- Obtain consent before sending
- Provide opt-out method
- Store consent records
- Honor unsubscribe requests
- Protect contact information

### Medical Privacy

**HIPAA-like Considerations:**
- Don't include sensitive health info in SMS
- Use secure email when possible
- Include disclaimer in messages
- Log all communications

### Required Disclaimers

**SMS Messages:**
```
Reply STOP to unsubscribe. Message and data rates may apply.
```

**Emails:**
```
You are receiving this email because you are a patient of [Clinic Name].
To unsubscribe, click here: [unsubscribe link]
```

## Troubleshooting

### SMS Not Sending

**Check:**
1. Twilio credentials correct in `.env.local`
2. Phone number format (include +  and country code)
3. Twilio account has credit
4. Number not on do-not-call list
5. View Twilio console logs

### Email Not Sending

**Check:**
1. SMTP credentials correct
2. SMTP port correct (587 for TLS)
3. From email address verified
4. Not exceeding daily limit
5. Check spam folder
6. Review email server logs

### Notifications Delayed

**Check:**
1. Cron jobs running (see cron logs)
2. Queue not backed up
3. Rate limiting settings
4. Server performance

### High Costs

**Solutions:**
1. Review sending frequency
2. Check for unnecessary sends
3. Switch some to email
4. Optimize message length
5. Remove inactive recipients

## Best Practices

1. **Test Thoroughly** - Test before going live
2. **Start Small** - Begin with important notifications only
3. **Monitor Closely** - Watch delivery rates and costs
4. **Get Consent** - Always ask permission first
5. **Provide Value** - Send helpful information only
6. **Professional Tone** - Maintain professional communication
7. **Timing** - Send at appropriate times
8. **Mobile-Friendly** - Optimize for mobile viewing
9. **Track Results** - Monitor open and response rates
10. **Continuously Improve** - Refine based on feedback

## Security

1. **Protect Credentials** - Never commit to version control
2. **Use Environment Variables** - Store in `.env.local`
3. **Rotate Passwords** - Change periodically
4. **Monitor Usage** - Watch for unauthorized use
5. **Secure Access** - Limit who can send notifications
6. **Encrypt Data** - Use TLS/SSL for transmission
7. **Audit Trail** - Log all notification activities

## Related Documentation

- [Appointment Scheduling](APPOINTMENT_SCHEDULING.md)
- [Cron Job Setup](CRON_SETUP.md)
- [Settings and Configuration](SETTINGS_CONFIGURATION.md)
- [Security and Compliance](SECURITY_COMPLIANCE.md)
