# Membership & Loyalty Program

This document describes the Membership & Loyalty Program features implemented in the clinic management system.

## Features Overview

### 1. Membership Program

The system supports a tiered membership program with points, rewards, and referral tracking.

**Membership Tiers:**
- **Bronze** - 5% discount, points earning
- **Silver** - 10% discount, points earning, priority booking
- **Gold** - 15% discount, points earning, priority booking, free monthly consultation
- **Platinum** - 20% discount, points earning, priority booking, free monthly consultation, procedure discounts

**Membership Features:**
- Points system (earn and redeem)
- Tier-based benefits
- Referral tracking
- Transaction history
- Automatic tier benefits assignment

**API Endpoints:**
- `GET /api/memberships` - List memberships
- `POST /api/memberships` - Create membership
- `GET /api/memberships/[id]` - Get membership details
- `PUT /api/memberships/[id]` - Update membership
- `POST /api/memberships/[id]/points` - Add/redeem points

**Points System:**
- Points earned from visits, appointments, referrals
- Points can be redeemed for discounts or services
- Transaction history tracks all point movements
- Lifetime points tracking (earned vs redeemed)

### 2. Referral Tracking (Doctor-to-Doctor)

Comprehensive referral system for tracking doctor-to-doctor referrals.

**Referral Types:**
- **doctor_to_doctor** - Doctor referring to another doctor
- **patient_to_patient** - Patient referring another patient
- **external** - External clinic referral

**Referral Features:**
- Referral code generation
- Status tracking (pending, accepted, completed, declined, cancelled)
- Clinical information sharing
- Attachment support
- Follow-up tracking
- Feedback system

**API Endpoints:**
- `GET /api/referrals` - List referrals
- `POST /api/referrals` - Create referral
- `GET /api/referrals/[id]` - Get referral details
- `PUT /api/referrals/[id]` - Update referral status

### 3. Patient Portal

Patient-facing portal for accessing profile, results, and booking.

**Portal Features:**
- Patient profile access
- Lab results viewing
- Prescription history
- Visit history
- Appointment booking
- Appointment management

**API Endpoints:**
- `GET /api/patient-portal/profile` - Get patient profile
- `GET /api/patient-portal/results` - Get patient results (lab, prescriptions, visits)
- `GET /api/patient-portal/booking` - Get booking data (appointments, doctors)
- `POST /api/patient-portal/booking` - Book appointment

### 4. QR Code for Patient Check-in

QR code-based check-in system for patients.

**Features:**
- QR code generation for queue entries
- QR code scanning for check-in
- Secure QR code validation
- Check-in method tracking

**API Endpoints:**
- `GET /api/queue/[id]/qr-code` - Generate QR code for queue entry
- `POST /api/queue/check-in` - Check-in using QR code

### 5. Queue Display Screen (TV Monitor)

Real-time queue display for TV monitors in waiting areas.

**Features:**
- Real-time queue updates
- Auto-refresh (30 seconds)
- Filter by doctor or room
- Position and wait time display
- Status indicators
- Responsive design for TV screens

**API Endpoint:**
- `GET /api/queue/display` - Queue display HTML (for TV monitor)

## Usage Examples

### Create Membership

```javascript
POST /api/memberships
{
  "patientId": "123",
  "tier": "gold",
  "referredBy": "456" // Optional: patient who referred
}
```

### Add Points

```javascript
POST /api/memberships/[id]/points
{
  "points": 100,
  "description": "Points earned from visit",
  "type": "earn",
  "relatedEntity": {
    "type": "visit",
    "id": "789"
  }
}
```

### Create Doctor-to-Doctor Referral

```javascript
POST /api/referrals
{
  "type": "doctor_to_doctor",
  "referringDoctor": "doc123",
  "receivingDoctor": "doc456",
  "patient": "patient789",
  "reason": "Cardiology consultation required",
  "urgency": "routine",
  "specialty": "Cardiology",
  "chiefComplaint": "Chest pain",
  "diagnosis": "Hypertension"
}
```

### Patient Portal - Get Results

```javascript
GET /api/patient-portal/results?type=all
// Returns: labResults, prescriptions, visits
```

### Patient Portal - Book Appointment

```javascript
POST /api/patient-portal/booking
{
  "doctorId": "doc123",
  "appointmentDate": "2024-01-15",
  "appointmentTime": "10:00",
  "reason": "Follow-up consultation"
}
```

### Generate QR Code for Check-in

```javascript
GET /api/queue/[id]/qr-code
// Returns: HTML page with QR code
```

### Check-in with QR Code

```javascript
POST /api/queue/check-in
{
  "qrCode": "{\"queueId\":\"...\",\"patientId\":\"...\",\"timestamp\":...}"
}
```

### Queue Display (TV Monitor)

```javascript
GET /api/queue/display?doctorId=doc123
// Returns: HTML page for TV display with auto-refresh
```

## Queue Management

**Queue Types:**
- **appointment** - From scheduled appointment
- **walk-in** - Walk-in patient
- **follow-up** - Follow-up visit

**Queue Status:**
- **waiting** - Waiting to be called
- **in-progress** - Currently seeing doctor
- **completed** - Consultation completed
- **cancelled** - Cancelled
- **no-show** - Patient did not show up

**Queue Features:**
- Automatic queue number generation
- Priority-based ordering
- Estimated wait time calculation
- Check-in tracking
- QR code integration

## Membership Benefits by Tier

### Bronze
- 5% discount on services
- Points earning (1 point per peso spent)

### Silver
- 10% discount on services
- Points earning
- Priority booking

### Gold
- 15% discount on services
- Points earning
- Priority booking
- 1 free consultation per month

### Platinum
- 20% discount on services
- Points earning
- Priority booking
- 1 free consultation per month
- Discount on procedures

## Referral Workflow

1. **Create Referral** - Doctor creates referral with patient and clinical information
2. **Send Referral** - Referral sent to receiving doctor/clinic
3. **Accept/Decline** - Receiving doctor accepts or declines
4. **Create Visit/Appointment** - Visit or appointment created from referral
5. **Complete** - Referral marked as completed after consultation
6. **Follow-up** - Optional follow-up tracking
7. **Feedback** - Optional feedback from receiving doctor

## Queue Display Features

- **Auto-refresh**: Updates every 30 seconds
- **Color coding**: Different colors for status
- **Position tracking**: Shows position in queue
- **Wait time**: Estimated wait time display
- **Responsive**: Works on TV monitors and tablets
- **Filtering**: Can filter by doctor or room

## Future Enhancements

- **Points Redemption Catalog**: Catalog of items/services for point redemption
- **Referral Rewards**: Rewards for successful referrals
- **Mobile App**: Native mobile app for patient portal
- **Push Notifications**: Notify patients when their turn is near
- **Queue Analytics**: Analytics on queue wait times
- **Membership Upgrades**: Automatic tier upgrades based on points/spending
- **Referral Analytics**: Track referral success rates
- **Patient Portal Dashboard**: Comprehensive patient dashboard

