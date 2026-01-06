# Queue Management

Complete guide to managing patient queues, check-ins, and optimizing patient flow in MyClinicSoft.

## Overview

The Queue Management system helps manage patient flow through your clinic with features including:

- Patient check-in system
- Real-time queue display
- QR code check-in
- Queue status tracking
- Wait time estimates
- Display screen integration
- Priority management

## Accessing Queue Management

Navigate to **Queue** from the main menu.

## Queue Dashboard

The queue dashboard shows:

**Active Queue:**
- Patients currently in queue
- Current status of each patient
- Estimated wait time
- Queue position
- Assigned doctor/room

**Queue Statistics:**
- Total patients today
- Average wait time
- Patients being seen
- Patients completed
- Current queue length

**Quick Actions:**
- Add patient to queue
- Call next patient
- Update patient status
- View queue history

## Adding Patients to Queue

### Walk-in Patients

For patients without appointments:

1. Click **Add to Queue**
2. Select or search for patient
3. If new patient, click **New Patient** to create quickly
4. Select:
   - Doctor (or "Any Available")
   - Reason for visit
   - Priority level (Normal/Urgent/Emergency)
5. Click **Add to Queue**

**Patient Receives:**
- Queue number
- Estimated wait time
- Ticket (optional print)

### From Appointments

Patients with appointments:

**Auto Check-in:**
- When appointment time arrives
- Patient automatically added to queue
- Status set to "Waiting"

**Manual Check-in:**
1. Go to **Appointments**
2. Find patient's appointment
3. Click **Check In**
4. Patient added to queue

**Reception Check-in:**
1. Patient arrives at reception
2. Staff searches appointment
3. Clicks **Check In**
4. Patient added to queue

### QR Code Check-in

**Setup:**
1. Enable QR code check-in in **Settings** → **Queue**
2. Generate QR codes for appointments
3. Send QR codes via email/SMS

**Patient Process:**
1. Patient receives QR code with appointment confirmation
2. Patient arrives at clinic
3. Scan QR code at kiosk or reception
4. Automatically checked in
5. Added to queue

**Benefits:**
- Contactless check-in
- Faster process
- Reduced reception workload
- Patient empowerment

## Queue Status Flow

### Status Progression

1. **Waiting** - Patient checked in, waiting to be seen
2. **Called** - Patient called to consultation room
3. **In Progress** - Doctor is seeing patient
4. **Completed** - Consultation finished
5. **Cancelled** - Patient left before being seen

### Updating Status

**Automatic Updates:**
- Check-in → Status: Waiting
- Doctor clicks "Start Visit" → Status: In Progress
- Visit saved → Status: Completed

**Manual Updates:**
1. Click on patient in queue
2. Select new status
3. Add notes if needed
4. Click **Update**

## Calling Patients

### Standard Call

1. View queue list
2. Click **Call Next Patient**
3. Patient's name displayed on screens
4. Audio announcement (if enabled)
5. Doctor room number shown
6. SMS notification sent (if enabled)

### Priority Call

For urgent or emergency patients:

1. Click on patient in queue
2. Click **Call Now** (bypasses queue order)
3. Reason logged
4. Patient called immediately

### Re-calling

If patient doesn't respond:

1. Click **Call Again**
2. Status set to "Called Again"
3. After 3 calls without response:
   - Option to skip
   - Remove from queue
   - Contact patient by phone

## Queue Display Screens

### Display Screen Features

Large screen TV/monitor shows:
- Current patient being called
- Patient name or queue number
- Doctor/room number
- Queue statistics
- Estimated wait times
- Announcements

**Privacy Options:**
- Show full name
- Show first name only
- Show queue number only
- Comply with privacy regulations

### Setting Up Display Screens

1. Go to **Settings** → **Queue** → **Display**
2. Generate display URL
3. Open URL on TV browser or dedicated device
4. Auto-refresh enabled
5. Full-screen mode
6. No login required

**Display URL Example:**
```
https://your-clinic.com/queue/display?token=YOUR_TOKEN
```

**Display Customization:**
- Clinic logo
- Background color
- Text size
- Auto-scroll queue
- Show/hide sections

## Priority Management

### Priority Levels

- **Emergency** - Immediate attention required
- **Urgent** - Should be seen soon
- **Normal** - Standard priority
- **Low** - Can wait if needed

### Setting Priority

When adding to queue:
1. Select priority level
2. Add reason for priority
3. Priority patients highlighted in queue

**Visual Indicators:**
- 🔴 Emergency - Red
- 🟠 Urgent - Orange
- 🟢 Normal - Green
- 🔵 Low - Blue

**Queue Behavior:**
- Emergency patients called first
- Urgent patients called before normal
- Within same priority: first-come, first-served

## Wait Time Management

### Estimated Wait Time

System calculates based on:
- Current queue position
- Average consultation time
- Doctor availability
- Time of day patterns
- Complexity of cases

**Display:**
- Shown to patient at check-in
- Updated in real-time
- SMS updates if wait exceeds estimate

### Managing Wait Times

**Tips to Reduce Wait:**
1. **Optimize Scheduling** - Avoid overbooking
2. **Buffer Time** - Include breaks in schedule
3. **Multiple Doctors** - Distribute patients evenly
4. **Triage** - Quick assessments for simple cases
5. **Communication** - Keep patients informed

**If Wait Time Exceeds Threshold:**
- Notify waiting patients
- Offer to reschedule
- Provide updates every 15 minutes

## Room Assignment

### Assigning Rooms

When calling patient:
1. Select available room
2. Patient directed to room
3. Room status updated to "Occupied"
4. Doctor sees assigned room

**Room Status:**
- 🟢 Available - Ready for next patient
- 🟡 Occupied - Patient currently in room
- 🔴 In Use - Consultation in progress
- ⚪ Maintenance - Not available

### Room Management Integration

Links with **Rooms Management**:
- View room availability
- Track room utilization
- Schedule room cleaning
- Equipment tracking

## Queue Notifications

### Patient Notifications

**SMS Notifications:**
- Queue number and position
- Estimated wait time
- "You're next" alert
- Now being called
- Wait time updates

**Email Notifications:**
- Check-in confirmation
- Queue status
- Doctor assigned

**In-App Notifications:**
- For patients using portal
- Real-time updates
- Push notifications

### Staff Notifications

**Doctor Notifications:**
- Next patient ready
- Patient checked in
- Patient waiting > X minutes
- Emergency patient in queue

**Reception Notifications:**
- Patient hasn't checked in
- Queue getting long
- Room available

## Queue History

View past queue data:

**Access:**
Navigate to **Queue** → **History**

**View:**
- Date range selection
- Patient name
- Check-in time
- Wait time
- Status
- Doctor seen
- Completion time

**Export:**
- Export to Excel/CSV
- Generate reports
- Analyze patterns

## Queue Reports

### Available Reports

Navigate to **Reports** → **Queue**

**Reports:**
- Queue statistics by date
- Average wait times
- Peak hours analysis
- Doctor efficiency
- Room utilization
- Check-in methods
- No-show after check-in

**Metrics:**
- Total patients queued
- Average wait time
- Longest wait time
- Patients per hour
- Completion rate
- Early departures

**Charts:**
- Queue length over time
- Wait time trends
- Hour-by-hour volume
- Day-of-week patterns

## No-Show After Check-in

When patient leaves before being seen:

1. Click on patient in queue
2. Select **Left Without Being Seen**
3. Add reason:
   - Wait too long
   - Emergency elsewhere
   - Changed mind
   - Felt better
   - Other
4. Click **Confirm**
5. Recorded in patient history
6. Follow-up call scheduled

## Queue Settings

*Admin only*

Configure in **Settings** → **Queue**

### General Settings
- Enable/disable queue system
- Auto-check-in from appointments
- Grace period before auto-check-in
- Auto-remove after X calls

### Display Settings
- Patient name display format
- Show estimated wait times
- Show queue position
- Color scheme
- Logo and branding

### Notification Settings
- Enable SMS notifications
- Enable email notifications
- Notification templates
- Notification timing

### QR Code Settings
- Enable QR code check-in
- QR code expiration time
- QR code format

### Priority Settings
- Define priority levels
- Auto-priority for emergencies
- Priority override permission

## Integration with Other Features

### Appointments
- Auto check-in from appointments
- Update appointment status
- Track punctuality

### Clinical Visits
- Start visit from queue
- Patient info pre-loaded
- Visit linked to queue entry

### Billing
- Generate invoice after visit
- Track unbilled queue entries
- Payment at check-in option

### Reports
- Queue data in reports
- Patient flow analysis
- Efficiency metrics

## Mobile Access

Queue management on mobile:

**Mobile Features:**
- View current queue
- Add patients
- Call next patient
- Update status
- View wait times
- Receive notifications

**Mobile App (Optional):**
- For patients to view queue
- Virtual queue number
- Wait time updates
- Navigation to clinic

## Tips for Efficient Queue Management

1. **Early Check-in** - Check in patients as soon as they arrive
2. **Real-time Updates** - Keep status current
3. **Communication** - Inform patients of delays
4. **Triage** - Assess urgency at check-in
5. **Even Distribution** - Balance load across doctors
6. **Monitor Wait Times** - Act if exceeding thresholds
7. **Call Promptly** - Don't make patients wait after calling
8. **Room Turnover** - Quick cleanup between patients
9. **Flexibility** - Adjust to actual flow
10. **Feedback** - Ask patients about queue experience

## Troubleshooting

### Queue Display Not Updating

**Solutions:**
- Refresh display screen
- Check display URL token
- Verify internet connection
- Check browser compatibility

### Patient Not Receiving Notifications

**Solutions:**
- Verify patient phone/email
- Check notification settings
- Test SMS/email system
- Check spam folder

### QR Code Not Working

**Solutions:**
- Verify QR code hasn't expired
- Check QR code format
- Ensure camera permissions
- Try manual check-in

### Long Wait Times

**Solutions:**
- Review scheduling
- Add more doctors/rooms
- Reduce appointment duration
- Implement triage system

## Best Practices

1. **Consistent Process** - Train all staff on queue procedures
2. **Clear Signage** - Direct patients to check-in
3. **Patient Communication** - Set expectations on wait time
4. **Regular Monitoring** - Check queue throughout day
5. **Optimize Flow** - Analyze patterns and adjust
6. **Privacy** - Balance visibility with privacy
7. **Accessibility** - Accommodate patients with disabilities
8. **Technology** - Use QR codes and displays effectively
9. **Backup Plan** - Have manual process if system down
10. **Continuous Improvement** - Regular reviews and adjustments

## Advanced Features

### Virtual Queue

Allow patients to:
- Check in remotely
- Wait at home/car
- Receive "Come now" notification
- Reduce waiting room crowding

### Queue Analytics

- Predict busy times
- Optimize staffing
- Identify bottlenecks
- Improve scheduling

### Multi-location Queue

For clinics with multiple locations:
- Centralized queue management
- Transfer patients between locations
- Unified reporting

## Related Documentation

- [Appointment Scheduling](APPOINTMENT_SCHEDULING.md)
- [Patient Management](PATIENT_MANAGEMENT.md)
- [Clinical Visits](CLINICAL_VISITS.md)
- [Rooms Management](ROOM_MANAGEMENT.md)
- [SMS Setup](SMS_SETUP.md)
