# SMS Integration Setup Guide

This guide explains how to set up SMS functionality using Twilio for appointment reminders and notifications.

## Prerequisites

1. A Twilio account (sign up at [twilio.com](https://www.twilio.com))
2. A Twilio phone number (can be obtained from Twilio dashboard)

## Setup Steps

### 1. Install Twilio Package

The Twilio package is already included in the project. If you need to reinstall:

```bash
npm install twilio
```

### 2. Get Twilio Credentials

1. Log in to your [Twilio Console](https://console.twilio.com)
2. Navigate to Account → API Keys & Tokens
3. Copy your:
   - **Account SID**
   - **Auth Token**
4. Navigate to Phone Numbers → Manage → Active Numbers
5. Copy your **Twilio Phone Number** (format: +1234567890)

### 3. Configure Environment Variables

Add the following to your `.env.local` file:

```env
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

### 4. Restart Your Server

After adding the environment variables, restart your Next.js development server:

```bash
npm run dev
```

## Features

Once configured, SMS will be automatically sent for:

- **Appointment Reminders**: 24 hours before scheduled appointments
- **Booking Confirmations**: When patients book appointments online
- **Follow-up Reminders**: For visit follow-up appointments

## Testing

You can test SMS functionality by:

1. Creating an appointment with a patient that has a phone number
2. Manually triggering a reminder via the API: `POST /api/appointments/reminders/sms`
3. Checking the Twilio console for message logs

## Troubleshooting

### SMS Not Sending

1. **Check Environment Variables**: Ensure all three Twilio variables are set correctly
2. **Verify Phone Number Format**: Phone numbers must include country code (e.g., +1234567890)
3. **Check Twilio Console**: Look for error messages in the Twilio dashboard
4. **Verify Account Status**: Ensure your Twilio account is active and has credits

### Phone Number Format

The system automatically formats phone numbers to include country code. If your phone numbers are stored without country codes, they will be prefixed with `+1` (US). You may need to adjust this in `lib/sms.ts` for your region.

## Cost Considerations

- Twilio offers a free trial with credits
- SMS pricing varies by country (typically $0.0075 - $0.05 per message)
- Monitor usage in the Twilio console to avoid unexpected charges

## Alternative SMS Providers

To use a different SMS provider, modify `lib/sms.ts` to implement the provider's API. The interface remains the same:

```typescript
sendSMS({ to: string, message: string, from?: string })
```

