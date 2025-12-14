# Medical Representative Journey - Start to Finish

## Overview
This document outlines the complete medical representative journey through the Clinic Management System, covering doctor visits, product information, and relationship management.

---

## Journey Flow Diagram

```
┌─────────────────┐
│ 1. ONBOARDING   │
│   & SETUP       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. VIEW         │
│   DOCTORS       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. SCHEDULE     │
│   VISITS        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. CONDUCT      │
│   VISITS        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. TRACK        │
│   ACTIVITY      │
└─────────────────┘
```

---

## Detailed Journey Steps

### 1. Medical Representative Onboarding & Setup

**Entry Point:**
- Admin creates medical representative profile via staff management

**Process:**
1. Admin creates `MedicalRepresentative` record with:
   - Personal Information: firstName, lastName, email, phone
   - Company Information: company name, territory
   - Products: products they represent
   - Contact information

2. System automatically:
   - Creates `User` account linked to medical rep profile
   - Assigns 'medical-representative' role
   - Generates default password
   - Sets status: `'active'`

3. Medical representative receives:
   - Login credentials
   - Account activation instructions
   - First-time login prompts password change

4. Initial setup:
   - Medical rep logs in and changes password
   - Completes profile information
   - Reviews doctor list
   - Sets up availability

**Models Involved:**
- `MedicalRepresentative` - Medical rep profile
- `User` - User account (auto-created)
- `Role` - Medical representative role assignment

**Status:**
- `status: 'active'` | `'inactive'` | `'on-leave'`

**API Endpoints:**
- `POST /api/staff` (type: 'medical-representative') - Create medical rep (admin only)
- `GET /api/staff?type=medical-representative` - List medical reps
- `GET /api/staff/[id]` - Get medical rep details
- `PUT /api/staff/[id]` - Update medical rep profile

**Next Step:** View Doctors

---

### 2. View Doctors

**Process:**
1. Browse doctors:
   - List all active doctors
   - Filter by specialization
   - Filter by department
   - Search doctors

2. Doctor information:
   - Doctor name and contact
   - Specialization
   - Department
   - Schedule availability
   - Status

3. Doctor profiles:
   - View doctor details
   - Check availability
   - Review contact information
   - Note preferences

4. Relationship tracking:
   - Track previous visits
   - Note doctor preferences
   - Record interactions
   - Maintain relationships

**Models Involved:**
- `Doctor` - Doctor profiles (read-only)
- `MedicalRepresentative` - Medical rep profile

**API Endpoints:**
- `GET /api/doctors` - List doctors
- `GET /api/doctors/[id]` - Get doctor details
- `GET /api/staff/[id]` - Get medical rep profile

**Next Step:** Schedule Visits

---

### 3. Schedule Visits

**Process:**
1. Plan visit:
   - Select doctor to visit
   - Check doctor availability
   - Schedule visit date/time
   - Prepare presentation materials

2. Visit preparation:
   - Review products to present
   - Prepare product information
   - Gather samples (if applicable)
   - Plan discussion points

3. Visit scheduling:
   - Coordinate with clinic
   - Confirm appointment
   - Set visit purpose
   - Note visit details

4. Visit tracking:
   - Record scheduled visits
   - Track visit status
   - Update visit outcomes
   - Schedule follow-ups

**Models Involved:**
- `Doctor` - Doctor being visited
- `MedicalRepresentative` - Medical rep profile

**API Endpoints:**
- `GET /api/doctors` - View doctors
- `GET /api/doctors/[id]/schedule` - Check doctor availability

**Next Step:** Conduct Visits

---

### 4. Conduct Visits

**Process:**
1. Visit execution:
   - Meet with doctor
   - Present products
   - Discuss product benefits
   - Answer questions
   - Provide samples/information

2. Visit documentation:
   - Record visit date/time
   - Note discussion points
   - Track product interest
   - Document outcomes
   - Record doctor feedback

3. Follow-up planning:
   - Schedule follow-up visits
   - Set reminders
   - Plan next steps
   - Track commitments

4. Relationship management:
   - Maintain doctor relationships
   - Track preferences
   - Record interactions
   - Build rapport

**Models Involved:**
- `MedicalRepresentative` - Medical rep profile
- `Doctor` - Doctor visited

**API Endpoints:**
- `GET /api/staff/[id]` - Get medical rep profile
- `PUT /api/staff/[id]` - Update visit information

**Next Step:** Track Activity

---

### 5. Track Activity & Performance

**Process:**
1. View activity summary:
   - Visits conducted
   - Doctors visited
   - Products presented
   - Follow-ups scheduled

2. Performance metrics:
   - Total visits
   - Completed visits
   - Cancelled visits
   - Visit frequency
   - Doctor coverage

3. Review dashboard:
   - Activity summary
   - Recent visits
   - Upcoming visits
   - Performance trends

4. Reporting:
   - Visit reports
   - Activity summaries
   - Performance analysis
   - Territory coverage

**Models Involved:**
- `MedicalRepresentative` - Medical rep profile with metrics
- `Doctor` - Doctor data

**API Endpoints:**
- `GET /api/reports/dashboard/role-based` - Medical rep dashboard
- `GET /api/staff/[id]` - Get performance metrics

---

## Key Features for Medical Representatives

### Dashboard
- Activity overview
- Recent visits
- Upcoming visits
- Performance metrics
- Quick actions

### Doctor Management
- Browse doctors
- View doctor details
- Check availability
- Track relationships

### Visit Management
- Schedule visits
- Track visits
- Document outcomes
- Plan follow-ups

### Performance Tracking
- Visit statistics
- Activity summaries
- Performance metrics
- Territory coverage

---

## Daily Workflow Summary

### Morning Routine
1. **Login** - Access medical rep dashboard
2. **Review Schedule** - Check today's visits
3. **Prepare Materials** - Prepare for visits
4. **Check Availability** - Confirm doctor availability

### During Day
1. **Conduct Visits** - Visit doctors
2. **Present Products** - Present product information
3. **Document Visits** - Record visit outcomes
4. **Build Relationships** - Maintain doctor relationships
5. **Schedule Follow-ups** - Plan next visits

### End of Day
1. **Update Records** - Document all visits
2. **Review Activity** - Check daily summary
3. **Plan Next Day** - Schedule tomorrow's visits

---

## Status Summary

### Medical Representative Status
- `active` - Available for visits
- `inactive` - Not available
- `on-leave` - On leave/vacation

---

## API Endpoint Summary

### Doctor Access (Read-only)
- `GET /api/doctors` - List doctors
- `GET /api/doctors/[id]` - Get doctor details
- `GET /api/doctors/[id]/schedule` - Check availability

### Profile Management
- `GET /api/staff/[id]` - Get medical rep profile
- `PUT /api/staff/[id]` - Update profile

### Reports
- `GET /api/reports/dashboard/role-based` - Medical rep dashboard

---

## Best Practices

1. **Relationship Building**: Maintain strong doctor relationships
2. **Product Knowledge**: Stay informed about products
3. **Professionalism**: Maintain professional conduct
4. **Documentation**: Document all visits accurately
5. **Follow-up**: Follow up on commitments
6. **Territory Management**: Manage territory effectively
7. **Communication**: Communicate clearly and effectively
8. **Compliance**: Follow company and clinic policies

---

*Last Updated: 2024*
*Version: 1.0*

