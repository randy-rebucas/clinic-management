# Appointment Scheduling

Complete guide to scheduling, managing, and optimizing appointments in MyClinicSoft.

## Overview

The Appointment Scheduling system provides a comprehensive calendar view for managing patient appointments, with features including:

- Interactive calendar interface
- Multiple view modes (day, week, month)
- Doctor-specific schedules
- Appointment reminders
- Waitlist management
- Public booking integration
- No-show tracking

## Accessing the Calendar

Navigate to **Appointments** from the main menu.

**Calendar Views:**
- **Day View** - Hourly breakdown of single day
- **Week View** - 7-day overview
- **Month View** - Monthly calendar with appointment counts
- **List View** - Scrollable list of upcoming appointments

## Creating an Appointment

### Quick Appointment (from Calendar)

1. Click on a time slot in the calendar
2. Quick form appears with:
   - Patient (search or create new)
   - Doctor (pre-selected if viewing doctor's calendar)
   - Time (pre-filled from clicked slot)
   - Duration (default from settings)
3. Click **Save**

### Detailed Appointment Form

1. Click **New Appointment** button
2. Fill in all details:

#### Basic Information
- **Patient*** (required)
  - Search existing patient
  - Or click **New Patient** to add quickly
- **Doctor*** (required)
  - Select from available doctors
  - View doctor availability
- **Date and Time*** (required)
  - Use date picker
  - Select from available slots
- **Duration** (default: 30 minutes)
  - 15, 30, 45, 60, 90 minutes
  - Custom duration

#### Appointment Details
- **Appointment Type**
  - New patient consultation
  - Follow-up visit
  - Routine check-up
  - Emergency
  - Procedure
  - Lab work
- **Service** (select from services catalog)
- **Reason for Visit**
  - Free text description
  - Helps doctor prepare
- **Chief Complaint**
  - Primary symptom or concern

#### Additional Information
- **Status**
  - Scheduled (default)
  - Confirmed
  - Arrived
  - In Progress
  - Completed
  - Cancelled
  - No-show
- **Priority**
  - Normal (default)
  - Urgent
  - Emergency
- **Notes**
  - Special instructions
  - Preparation required
  - Accessibility needs

#### Reminders
- **SMS Reminder**
  - Send 24 hours before
  - Send 2 hours before
  - Don't send
- **Email Reminder**
  - Same options as SMS
- **Custom Reminder Time**
  - Specify exact timing

3. Click **Save Appointment**

## Managing Appointments

### Viewing Appointment Details

Click on any appointment in the calendar to view:
- Patient information
- Doctor assigned
- Date, time, and duration
- Appointment type and reason
- Status and priority
- Notes
- Creation and last updated info

**Quick Actions:**
- Edit appointment
- Change status
- Reschedule
- Cancel
- Mark as no-show
- Start visit (creates clinical note)
- Send reminder
- Print appointment slip

### Editing an Appointment

1. Click on appointment
2. Click **Edit** button
3. Modify any field
4. Click **Save Changes**

**Note:** System checks for conflicts when changing date/time.

### Rescheduling

1. Click on appointment
2. Click **Reschedule** button
3. Select new date/time
4. Confirm change
5. Patient notification sent automatically

**Drag and Drop:**
- In day or week view
- Click and drag appointment to new time slot
- System prompts to confirm change

### Cancelling an Appointment

1. Click on appointment
2. Click **Cancel** button
3. Select reason:
   - Patient cancelled
   - Doctor unavailable
   - Emergency
   - Weather/external factors
   - Other
4. Add notes (optional)
5. Confirm cancellation
6. Patient notification sent

**Note:** Cancelled appointments remain in system for record-keeping.

### Appointment Status Updates

Update status as appointment progresses:

1. **Scheduled** → Patient has appointment
2. **Confirmed** → Patient confirmed they will attend
3. **Arrived** → Patient checked in (auto-updated from queue)
4. **In Progress** → Doctor is seeing patient
5. **Completed** → Appointment finished
6. **No-show** → Patient didn't arrive
7. **Cancelled** → Appointment cancelled

**Auto Status Updates:**
- Checked in at queue → Status changes to "Arrived"
- Visit created → Status changes to "In Progress"
- Visit saved → Status changes to "Completed"

## Doctor Schedules

### Viewing Doctor Availability

**Calendar Filters:**
1. Select doctor from dropdown
2. Calendar shows only that doctor's appointments
3. Available time slots highlighted in green
4. Blocked time shown in gray

**Doctor Schedule Page:**
- Navigate to **Doctors** → Select doctor → **Schedule** tab
- View recurring availability
- See blocked dates
- View appointment statistics

### Setting Doctor Working Hours

*Admin only*

1. Go to **Doctors** → Select doctor → **Schedule**
2. Click **Edit Working Hours**
3. For each day:
   - Set start and end time
   - Mark as working day or off
   - Add breaks
4. Click **Save**

**Example:**
- Monday-Friday: 9:00 AM - 5:00 PM
- Lunch break: 12:00 PM - 1:00 PM
- Saturday: 9:00 AM - 12:00 PM
- Sunday: Off

### Blocking Time

Block doctor availability for:
- Holidays
- Vacation
- Training/conferences
- Administrative time
- Procedures/surgeries

**To Block Time:**
1. Go to doctor's schedule
2. Click **Block Time**
3. Select date range
4. Select time (all day or specific hours)
5. Add reason
6. Click **Save**

**Blocked time:**
- Shows as unavailable in calendar
- Cannot be booked by patients
- Shows "Unavailable" label

## Appointment Reminders

### Automatic Reminders

The system sends automatic reminders based on settings:

**Default Schedule:**
- 24 hours before appointment (SMS + Email)
- 2 hours before appointment (SMS only)

**Reminder Content:**
- Patient name
- Doctor name
- Date and time
- Clinic address
- Preparation instructions (if any)
- Cancellation link

### Manual Reminders

Send reminder manually:
1. Click on appointment
2. Click **Send Reminder**
3. Choose method:
   - SMS only
   - Email only
   - Both
4. Edit message if needed
5. Click **Send**

### Reminder Settings

*Admin only*

Configure in **Settings** → **Notifications**:
- Enable/disable automatic reminders
- Set reminder timing
- Customize message templates
- Set SMS provider settings

## Waitlist Management

### Adding to Waitlist

When preferred time slot is unavailable:

1. Click **Add to Waitlist** in appointment form
2. Patient added to waitlist for:
   - Specific doctor
   - Date range
   - Time preference
3. Patient notified when slot opens

### Managing Waitlist

Navigate to **Appointments** → **Waitlist** tab

**View:**
- All waitlisted patients
- Requested date/time range
- Priority
- Contact information

**Actions:**
- Schedule when slot available
- Remove from waitlist
- Contact patient
- Change priority

**Auto-notification:**
- When appointment cancelled
- System checks waitlist
- Sends notification to waitlisted patients
- First-come-first-served basis

## Public Booking

Patients can book appointments through public booking page.

### Public Booking Features

- No login required
- Select doctor
- Choose from available slots
- Provide basic information
- Receive confirmation email

### Enabling Public Booking

*Admin only*

1. Go to **Settings** → **Public Booking**
2. Enable public booking
3. Configure settings:
   - Advance booking period (e.g., up to 30 days)
   - Same-day booking allowed (yes/no)
   - Available doctors
   - Available services
   - Required fields
   - Approval required (yes/no)

### Public Booking URL

Share booking link with patients:
```
https://your-clinic.com/book
```

Add to:
- Clinic website
- Social media
- Email signature
- Business cards
- QR code

## Queue Integration

Appointments integrate with the Queue Management system:

**When Patient Arrives:**
1. Patient checks in at reception
2. Added to queue automatically
3. Appointment status updates to "Arrived"
4. Doctor sees patient in queue
5. Can start visit from queue

**Benefits:**
- Smooth patient flow
- Automatic status updates
- Real-time queue visibility
- Reduced wait times

## No-Show Management

### Recording No-Shows

When patient doesn't arrive:

1. Click on appointment
2. Click **Mark as No-Show**
3. Add notes
4. System records:
   - Date of no-show
   - Appointment details
   - Whether patient called

### No-Show Tracking

View no-show history:
- Patient detail page → **Appointments** tab
- Shows all no-shows
- Percentage of no-shows

**Automatic Actions:**
- After 3 no-shows: Flag patient
- After 5 no-shows: Require deposit
- Configurable in settings

### No-Show Policies

*Admin only*

Configure in **Settings** → **Appointments**:
- Grace period (e.g., 15 minutes late = no-show)
- Automatic actions based on no-show count
- Require confirmation after no-show
- Cancellation fee
- Deposit requirement

## Recurring Appointments

For patients needing regular appointments:

1. Create first appointment
2. Click **Make Recurring**
3. Set pattern:
   - Daily
   - Weekly (select days)
   - Every 2 weeks
   - Monthly
   - Custom
4. Set end condition:
   - After X occurrences
   - Until date
   - Never (manual stop)
5. Click **Create Series**

**Managing Series:**
- Edit single occurrence
- Edit all future occurrences
- Cancel series
- Skip occurrence

## Appointment Conflicts

### Conflict Detection

System checks for conflicts when scheduling:

**Double Booking:**
- Doctor already has appointment at that time
- Patient already has appointment at that time

**Resource Conflicts:**
- Room not available
- Equipment in use

**Working Hours:**
- Outside doctor's working hours
- During break time
- On blocked dates

**Conflict Resolution:**
- System prevents saving conflicting appointment
- Shows conflict details
- Suggests alternative times

### Overbooking

*Admin only*

Allow limited overbooking:

1. Enable in **Settings** → **Appointments**
2. Set overbooking rules:
   - Max appointments per time slot
   - Overbooking time slots only
   - Priority appointments can overbook
3. Use cautiously to avoid delays

## Appointment Reports

### Available Reports

Navigate to **Reports** → **Appointments**

**Reports:**
- Appointments by date range
- Appointments by doctor
- Appointments by service
- No-show report
- Cancellation report
- Utilization report
- Revenue by appointment type

**Export Options:**
- PDF
- Excel
- CSV

### Appointment Analytics

**Metrics:**
- Total appointments
- Completed vs. scheduled
- Average duration
- No-show rate
- Cancellation rate
- Peak booking times
- Popular services
- Doctor utilization

**Charts:**
- Appointments over time (line chart)
- Appointments by type (pie chart)
- Doctor workload (bar chart)
- Peak hours (heat map)

## Mobile Access

Access appointments on mobile devices:

**Mobile Features:**
- Responsive calendar view
- Quick appointment creation
- Status updates
- Send reminders
- View patient details
- Check-in patients

## Tips for Efficient Scheduling

1. **Book Ahead** - Schedule follow-ups before patient leaves
2. **Buffer Time** - Allow breaks between appointments
3. **Peak Management** - Spread appointments throughout day
4. **Confirmation** - Call to confirm day before
5. **Overbooking** - Use sparingly for chronic no-shows
6. **Templates** - Create appointment templates for common types
7. **Reminders** - Always send reminders
8. **Flexible** - Keep some slots open for emergencies
9. **Queue** - Use queue system to manage walk-ins
10. **Review** - Weekly review of no-shows and cancellations

## Troubleshooting

### Cannot Book Appointment

**Possible Causes:**
- Doctor not available
- Outside working hours
- Patient already has appointment
- System conflict

**Solutions:**
- Check doctor schedule
- Verify working hours
- Check existing appointments
- Contact administrator

### Reminders Not Sending

**Possible Causes:**
- SMS/Email not configured
- Invalid contact information
- Reminders disabled

**Solutions:**
- Verify settings in **Settings** → **Notifications**
- Check patient contact info
- Test SMS/Email settings
- Check system logs

### Calendar Not Loading

**Solutions:**
- Refresh page
- Clear browser cache
- Check internet connection
- Try different browser
- Contact support

## Best Practices

1. **Consistent Scheduling** - Use same process for all appointments
2. **Verify Information** - Confirm patient contact info when booking
3. **Set Expectations** - Tell patients how to prepare
4. **Follow Up** - Call no-shows to reschedule
5. **Document** - Add notes for special circumstances
6. **Review Regularly** - Check schedule weekly
7. **Optimize** - Analyze reports to improve efficiency
8. **Communicate** - Keep patients informed of changes

## Related Documentation

- [Patient Management](PATIENT_MANAGEMENT.md)
- [Queue Management](QUEUE_MANAGEMENT.md)
- [Clinical Visits](CLINICAL_VISITS.md)
- [SMS Setup](SMS_SETUP.md)
- [Public Booking](PUBLIC_BOOKING.md)
