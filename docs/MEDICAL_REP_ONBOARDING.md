# Medical Representative Onboarding System

## Overview

The Medical Representative Onboarding System is a comprehensive registration and activation platform for pharmaceutical representatives. It includes payment verification to ensure that representatives are properly activated and their accounts are tied to a valid payment transaction.

## Features

### 1. **Multi-Step Registration Form**
- **Step 1: Personal Information** - Collect first name, last name, email, phone number, title, and bio
- **Step 2: Company Details** - Collect company name, territory, and products represented
- **Step 3: Payment Information** - Process registration fee with payment method and reference
- **Step 4: Review & Confirmation** - Review all information before submission

### 2. **Payment-Based Activation**
- Registration is only activated when payment is verified
- Supports multiple payment methods (Credit Card, Debit Card, Bank Transfer, GCash, PayPal, etc.)
- Payment reference tracking for audit and verification purposes
- Automatic status management based on payment completion

### 3. **Secure Registration**
- Email validation to prevent duplicates
- Existing account detection
- Comprehensive audit logging of all registration activities
- Confirmation emails sent to registered email address

## Files Created

### Database Model
**File:** `models/MedicalRepresentative.ts`

Updated fields:
- `isActivated: boolean` - Whether the medical rep is activated
- `activationDate: Date` - When they were activated
- `paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded'` - Payment status
- `paymentDate: Date` - When payment was processed
- `paymentAmount: number` - Registration/activation fee
- `paymentMethod: string` - Payment method used
- `paymentReference: string` - Payment transaction reference

### API Endpoints
**File:** `app/api/medical-representatives/onboard/route.ts`

#### POST /api/medical-representatives/onboard
Register a new medical representative with payment information.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1-555-123-4567",
  "company": "PharmaCorp",
  "territory": "Metro Manila",
  "products": ["Antibiotics", "Vitamins"],
  "title": "Mr.",
  "bio": "Professional pharmaceutical representative",
  "paymentAmount": 5000,
  "paymentMethod": "credit_card",
  "paymentReference": "TXN-123456789"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Medical representative registered and activated successfully",
  "medicalRepresentative": {
    "id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "company": "PharmaCorp",
    "isActivated": true,
    "paymentStatus": "completed"
  }
}
```

#### GET /api/medical-representatives/onboard
Fetch onboarding form schema and requirements.

**Response:**
```json
{
  "success": true,
  "schema": {
    "required": ["firstName", "lastName", "email", "phone", "company"],
    "fields": {
      "firstName": { "type": "string", "label": "First Name" },
      ...
    }
  }
}
```

### UI Components

#### MedicalRepresentativeOnboardingClient
**File:** `components/MedicalRepresentativeOnboardingClient.tsx`

Interactive multi-step form component with:
- Form validation at each step
- Error handling and display
- Success confirmation with redirection
- Responsive design for mobile and desktop
- Progress indicator showing current step

### Pages
**File:** `app/(public)/medical-representatives/onboard/page.tsx`
**File:** `app/(public)/medical-representatives/layout.tsx`
**File:** `app/(public)/medical-representatives/onboard/success/page.tsx`

### Payment Utilities
**File:** `lib/medical-rep-payment.ts`

Key functions:

#### `verifyPayment(request: PaymentVerificationRequest)`
Verify and process payment for medical representative activation.

```typescript
const result = await verifyPayment({
  paymentReference: 'TXN-123456',
  paymentMethod: 'credit_card',
  paymentAmount: 5000,
  email: 'john@example.com'
});
```

#### `isMedicalRepActivated(id: string | ObjectId)`
Check if a medical representative is activated.

```typescript
const isActive = await isMedicalRepActivated(medicalRepId);
```

#### `getActivationStatus(id: string | ObjectId)`
Get detailed activation and payment status.

```typescript
const status = await getActivationStatus(medicalRepId);
// Returns: { isActivated, status, paymentStatus, activationDate, paymentDate }
```

#### `refundPayment(id: string | ObjectId, reason: string)`
Refund a payment and deactivate the medical representative.

```typescript
const result = await refundPayment(medicalRepId, 'Customer request');
```

## Usage Flow

### For Medical Representatives

1. **Access the Registration Page**
   - Navigate to `/medical-representatives/onboard`
   - View the onboarding form with 4 steps

2. **Fill Personal Information**
   - Enter first name, last name, email, phone
   - Optionally add title and bio

3. **Provide Company Details**
   - Enter company name and territory
   - List products they represent

4. **Complete Payment**
   - Enter registration fee amount
   - Select payment method
   - Provide payment reference/receipt number

5. **Review & Submit**
   - Review all information
   - Submit registration
   - Receive confirmation

6. **Account Activation**
   - Payment is verified
   - Account is immediately activated
   - User receives confirmation email
   - User can log in with credentials

### For Administrators

1. **Monitor Registrations**
   - Check audit logs for new registrations
   - View payment status in medical representative records

2. **Verify Payments**
   - Validate payment references with payment provider
   - Process refunds if needed using `refundPayment()`

3. **Manage Accounts**
   - Activate/deactivate medical representatives
   - Adjust payment status as needed

## Payment Gateway Integration

The current implementation includes placeholder validation logic. To integrate with actual payment providers:

### For Stripe
```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const charge = await stripe.charges.retrieve(paymentReference);
// Verify charge status and amount
```

### For PayMongo
```typescript
const response = await fetch('https://api.paymongo.com/v1/payment_intents', {
  headers: {
    Authorization: `Basic ${btoa(process.env.PAYMONGO_KEY + ':')}`,
  },
});
```

### For GCash/PayMaya
Integrate with provider-specific payment verification APIs.

## Security Considerations

1. **Email Validation**
   - Prevents duplicate registrations
   - Validates email format

2. **Payment Verification**
   - Validates payment reference
   - Confirms payment amount
   - Tracks payment method

3. **Audit Logging**
   - All registrations are logged
   - Payment events are tracked
   - Status changes are recorded

4. **User Account Creation**
   - Automatic user account creation post-save hook
   - Default password generation
   - Role assignment as medical-representative

## Error Handling

### Common Error Scenarios

**Missing Required Fields:**
- HTTP 400: Returns list of missing fields
- User prompted to complete the step

**Email Already Exists:**
- HTTP 409: Email conflict
- User directed to login instead

**Payment Verification Failed:**
- HTTP 400: Payment verification error
- Suggests retrying with correct information

**Database Connection Issues:**
- HTTP 500: Server error
- User prompted to try again later

## Audit Logging

All registration activities are logged in the AuditLog collection:

```typescript
{
  action: 'CREATE',
  entityType: 'MedicalRepresentative',
  entityId: '507f1f77bcf86cd799439011',
  changes: {
    created: {
      email: 'john@example.com',
      company: 'PharmaCorp',
      isActivated: true
    }
  },
  metadata: {
    source: 'self-registration',
    ipAddress: '192.168.1.1'
  }
}
```

## Email Notifications

A confirmation email is sent upon successful registration with:
- Welcome message
- Registration details
- Activation status
- Company information
- Support contact information

## Environment Variables

Required `.env.local` variables:

```env
# Email service (for confirmation emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-password
SMTP_FROM=noreply@clinicsoft.com
```

## Testing the Feature

### Manual Testing

1. Navigate to `http://localhost:3000/medical-representatives/onboard`
2. Fill in test data:
   - Name: John Doe
   - Email: test@example.com
   - Company: Test Pharma
   - Payment Amount: 5000
   - Payment Reference: TXN-TEST-001
3. Submit and verify success page

### API Testing

```bash
curl -X POST http://localhost:3000/api/medical-representatives/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1-555-123-4567",
    "company": "PharmaCorp",
    "territory": "Metro Manila",
    "paymentAmount": 5000,
    "paymentMethod": "credit_card",
    "paymentReference": "TXN-123456789"
  }'
```

## Future Enhancements

1. **Real Payment Integration**
   - Stripe, PayMongo, or other payment provider
   - Webhook handling for payment confirmations

2. **Payment Scheduling**
   - Recurring activation fees
   - Subscription-based pricing tiers

3. **Onboarding Verification**
   - Admin approval workflow
   - Document verification
   - KYC (Know Your Customer) integration

4. **Analytics**
   - Registration trends
   - Payment success rates
   - Geographic distribution

5. **Communication**
   - SMS notifications
   - In-app notifications
   - Push notifications

## Support

For issues or questions about the medical representative onboarding system, please contact the development team or refer to the main [README.md](../../README.md).
