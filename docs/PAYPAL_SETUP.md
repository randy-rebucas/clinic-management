# PayPal Integration Setup Guide

## Overview
This guide explains how to set up PayPal payment integration for subscription payments in MyClinicSoft.

## Prerequisites
1. PayPal Business Account
2. PayPal Developer Account (https://developer.paypal.com)
3. Environment variables configured

## Setup Steps

### 1. Create PayPal App
1. Go to https://developer.paypal.com
2. Log in with your PayPal Business account
3. Navigate to **Dashboard** > **My Apps & Credentials**
4. Click **Create App**
5. Fill in:
   - **App Name**: MyClinicSoft
   - **Merchant**: Your business account
   - **Features**: Checkout
6. Click **Create App**
7. Copy the **Client ID** and **Secret** (you'll need these for environment variables)

### 2. Configure Environment Variables
Add the following to your `.env.local` file:

```env
# PayPal Configuration
PAYPAL_CLIENT_ID=your_client_id_here
PAYPAL_CLIENT_SECRET=your_client_secret_here
PAYPAL_ENVIRONMENT=sandbox  # Use 'sandbox' for testing, 'live' for production
PAYPAL_WEBHOOK_ID=your_webhook_id_here  # Optional, for webhook verification

# App URL (for return URLs)
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Change to your production URL
```

### 3. Test with Sandbox
1. Use PayPal Sandbox for testing
2. Create test accounts at https://developer.paypal.com/dashboard/accounts
3. Use test buyer account credentials to test payments
4. Test cards:
   - **Visa**: 4111111111111111
   - **Mastercard**: 5555555555554444
   - Use any future expiry date and any CVV

### 4. Webhook Setup (Optional)
1. Go to PayPal Developer Dashboard
2. Navigate to **Webhooks** section
3. Click **Create Webhook**
4. Set webhook URL: `https://yourdomain.com/api/subscription/webhook`
5. Select events:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `PAYMENT.CAPTURE.REFUNDED`
6. Copy the Webhook ID to `PAYPAL_WEBHOOK_ID` environment variable

## Subscription Plans

The system supports three subscription plans:

| Plan | Price | Features |
|------|-------|----------|
| Basic | $29/month | Up to 100 patients, Basic support |
| Professional | $79/month | Up to 500 patients, Priority support, Advanced features |
| Enterprise | $199/month | Unlimited patients, 24/7 support, Custom features |

## Payment Flow

1. **User selects plan** → Clicks "Select Plan" button
2. **Create PayPal order** → API creates order and gets approval URL
3. **Redirect to PayPal** → User completes payment on PayPal
4. **Return to app** → PayPal redirects to `/subscription/success`
5. **Capture payment** → API captures the payment
6. **Update subscription** → Tenant subscription is activated for 30 days

## API Endpoints

### Create Order
- **Endpoint**: `POST /api/subscription/create-order`
- **Body**: `{ "plan": "basic" | "professional" | "enterprise" }`
- **Response**: `{ "success": true, "orderId": "...", "approvalUrl": "..." }`

### Capture Order
- **Endpoint**: `POST /api/subscription/capture-order`
- **Body**: `{ "orderId": "...", "plan": "..." }`
- **Response**: `{ "success": true, "subscription": {...} }`

### Webhook
- **Endpoint**: `POST /api/subscription/webhook`
- **Purpose**: Handle PayPal events (payment completed, refunded, etc.)

## Testing

### Test Payment Flow
1. Start your development server
2. Navigate to `/subscription` page
3. Select a plan
4. You'll be redirected to PayPal Sandbox
5. Log in with test buyer account
6. Complete payment
7. You'll be redirected back to success page
8. Subscription should be activated

### Test Scenarios
- ✅ Successful payment
- ✅ Payment cancellation
- ✅ Payment failure
- ✅ Subscription activation
- ✅ Subscription expiration handling

## Production Checklist

Before going live:
- [ ] Switch `PAYPAL_ENVIRONMENT` to `live`
- [ ] Update `NEXT_PUBLIC_APP_URL` to production URL
- [ ] Set up production PayPal app credentials
- [ ] Configure webhook URL for production
- [ ] Test complete payment flow in production
- [ ] Set up monitoring for payment failures
- [ ] Configure email notifications for subscriptions

## Troubleshooting

### Common Issues

**"PayPal credentials not configured"**
- Check that `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are set
- Verify environment variables are loaded correctly

**"Failed to create PayPal order"**
- Check PayPal API credentials
- Verify network connectivity
- Check PayPal API status

**"Payment capture failed"**
- Verify order ID is correct
- Check if order was already captured
- Verify PayPal account has sufficient permissions

**Webhook not receiving events**
- Verify webhook URL is accessible
- Check webhook ID is correct
- Verify webhook events are subscribed

## Security Notes

1. **Never expose** `PAYPAL_CLIENT_SECRET` in client-side code
2. **Always verify** webhook signatures in production
3. **Use HTTPS** for all PayPal API calls
4. **Store** transaction IDs for audit purposes
5. **Implement** proper error handling and logging

## Support

For PayPal API issues:
- PayPal Developer Documentation: https://developer.paypal.com/docs
- PayPal Support: https://www.paypal.com/support

For application issues:
- Check application logs
- Review API responses
- Verify environment configuration
