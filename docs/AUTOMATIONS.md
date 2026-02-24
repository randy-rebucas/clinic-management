# Automation System

Complete reference for all scheduled automations in MyClinicSoft.

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Manual Triggering](#manual-triggering)
- [Appointment Automations](#appointment-automations)
- [Clinical Automations](#clinical-automations)
- [Financial Automations](#financial-automations)
- [Inventory Automations](#inventory-automations)
- [Patient Automations](#patient-automations)
- [Reporting Automations](#reporting-automations)
- [Operations Automations](#operations-automations)
- [Schedule Summary](#schedule-summary)
- [Adding a New Automation](#adding-a-new-automation)

---

## Quick Summary

| # | Name | Route | Schedule (UTC) | PHT | Category | Priority |
|---|---|---|---|---|---|---|
| 1 | Appointment Reminders | `/api/cron/reminders` | `0 9 * * *` | 17:00 daily | Appointment | 🔴 High |
| 2 | No-Show Handling | `/api/cron/no-show-handling` | `10,40 * * * *` | :10 & :40 every hr | Appointment | 🟡 Medium |
| 3 | Waitlist Management | `/api/cron/waitlist-management` | `5,20,35,50 * * * *` | Every 15 min | Appointment | 🟡 Medium |
| 4 | Follow-Up Scheduling | `/api/cron/followup-scheduling` | `0 11 * * *` | 19:00 daily | Appointment | 🟡 Medium |
| 5 | Visit Follow-Up Reminders | `/api/cron/visit-followup` | `0 8 * * *` | 16:00 daily | Appointment | 🟡 Medium |
| 6 | Recurring Appointments | `/api/cron/recurring-appointments` | `0 13 * * *` | 21:00 daily | Appointment | 🟡 Medium |
| 7 | Auto-Cancellation Policies | `/api/cron/auto-cancellation-policies` | `30 10 * * *` | 18:30 daily | Appointment | 🟡 Medium |
| 8 | Smart Appointment Assignment | `/api/cron/smart-assignment` | `0 */1 * * *` | Every hour | Appointment | 🔴 High |
| 9 | Medication Reminders | `/api/cron/medication-reminders` | `0 8,12,16,20 * * *` | 16:00/20:00/00:00/04:00 | Clinical | 🔴 High |
| 10 | Prescription Refills | `/api/cron/prescription-refills` | `0 9 * * *` | 17:00 daily | Clinical | 🟡 Medium |
| 11 | Prescription Expiry Warnings | `/api/cron/prescription-expiry-warnings` | `5 8 * * *` | 16:05 daily | Clinical | 🔴 High |
| 12 | Lab Result Notifications | `/api/cron/lab-notifications` | `*/30 * * * *` | Every 30 min | Clinical | 🔴 High |
| 13 | Referral Follow-Up Tracker | `/api/cron/referral-followup` | `0 9 * * *` | 17:00 daily | Clinical | 🟡 Medium |
| 14 | Health Reminders | `/api/cron/health-reminders` | `0 12 * * *` | 20:00 daily | Clinical | 🟡 Medium |
| 15 | Payment Reminders | `/api/cron/payment-reminders` | `0 10 * * *` | 18:00 daily | Financial | 🔴 High |
| 16 | Inventory Alerts | `/api/cron/inventory-alerts` | `0 8 * * *` | 16:00 daily | Inventory | 🔴 High |
| 17 | Inventory Reordering | `/api/cron/inventory-reordering` | `15 9 * * *` | 17:15 daily | Inventory | 🔴 High |
| 18 | Expiry Monitoring | `/api/cron/expiry-monitoring` | `0 7 * * *` | 15:00 daily | Inventory | 🔴 High |
| 19 | Document Expiry Tracking | `/api/cron/document-expiry-tracking` | `30 9 * * *` | 17:30 daily | Inventory | 🟡 Medium |
| 20 | Birthday Greetings | `/api/cron/birthday-greetings` | `0 0 * * *` | 08:00 daily | Patient | 🟢 Low |
| 21 | Feedback Collection | `/api/cron/feedback-collection` | `0 10 * * *` | 18:00 daily | Patient | 🟢 Low |
| 22 | Membership Expiry Reminders | `/api/cron/membership-expiry` | `0 8 * * *` | 16:00 daily | Patient | 🟡 Medium |
| 23 | Patient Re-Engagement | `/api/cron/patient-reengagement` | `0 10 * * 1` | 18:00 Monday | Patient | 🟢 Low |
| 24 | Insurance Verification | `/api/cron/insurance-verification` | `10 8 * * *` | 16:10 daily | Patient | 🟡 Medium |
| 25 | Daily Reports | `/api/cron/daily-reports` | `0 23 * * *` | 07:00 next day | Reporting | 🟡 Medium |
| 26 | Weekly Reports | `/api/cron/weekly-reports` | `0 8 * * 1` | 16:00 Monday | Reporting | 🟡 Medium |
| 27 | Monthly Reports | `/api/cron/monthly-reports` | `0 8 1 * *` | 16:00 on 1st | Reporting | 🟡 Medium |
| 28 | Weekly Staff Performance | `/api/cron/weekly-staff-performance` | `0 9 * * 1` | 17:00 Monday | Reporting | 🟢 Low |
| 29 | Monthly Staff Performance | `/api/cron/monthly-staff-performance` | `0 9 1 * *` | 17:00 on 1st | Reporting | 🟢 Low |
| 30 | End-of-Day Cleanup | `/api/cron/end-of-day-cleanup` | `0 10 * * *` | **18:00 daily (6 PM)** | Operations | 🔴 High |
| 31 | Queue Optimization | `/api/cron/queue-optimization` | `*/15 * * * *` | Every 15 min | Operations | 🟡 Medium |
| 32 | Backup | `/api/cron/backup` | `0 2 * * *` | 10:00 daily | Operations | 🔴 High |
| 33 | Data Retention | `/api/cron/data-retention` | `0 2 * * 0` | 10:00 Sunday | Operations | 🟢 Low |
| 34 | Trial Expiration | `/api/cron/trial-expiration` | `0 6 * * *` | 14:00 daily | Operations | 🔴 High |
| 35 | Usage Alerts | `/api/cron/usage-alerts` | `0 9 * * *` | 17:00 daily | Operations | 🟡 Medium |

---

## Overview

All automations run as HTTP GET endpoints under `/api/cron/*` and are triggered by Vercel Cron Jobs on the schedules defined in `vercel.json`. Each automation also has a corresponding library module in `lib/automations/` containing the core business logic.

**Total automations: 35**

| Category | Count |
|---|---|
| Appointment | 7 |
| Clinical | 6 |
| Financial | 1 |
| Inventory | 4 |
| Patient | 5 |
| Reporting | 4 |
| Operations | 8 |

---

## Authentication

Every cron endpoint supports two authentication methods:

| Method | How |
|---|---|
| **Vercel Cron** (recommended) | Vercel automatically sends `x-vercel-cron: 1` header — no further config needed |
| **External / manual** | Set `CRON_SECRET` in `.env.local` and call with `Authorization: Bearer <CRON_SECRET>` |

If `CRON_SECRET` is not set, endpoints are publicly accessible (suitable for dev only).

---

## Manual Triggering

Any automation can be triggered manually via HTTP:

```bash
# Using CRON_SECRET
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-domain.com/api/cron/end-of-day-cleanup

# Local dev (no secret required if CRON_SECRET unset)
curl http://localhost:3000/api/cron/membership-expiry
```

Some endpoints accept query parameters — see individual sections below.

---

## Appointment Automations

### Appointment Reminders
| | |
|---|---|
| **Route** | `GET /api/cron/reminders` |
| **Schedule** | `0 9 * * *` — 09:00 UTC daily (17:00 PHT) |
| **Priority** | High |
| **Lib** | `lib/automations/appointment-confirmation.ts` |

Sends SMS and email reminders to patients 24 hours before their scheduled appointment.

---

### No-Show Handling
| | |
|---|---|
| **Route** | `GET /api/cron/no-show-handling` |
| **Schedule** | `10,40 * * * *` — at :10 and :40 every hour |
| **Priority** | Medium |
| **Lib** | `lib/automations/no-show-handling.ts` |

Detects appointments that have passed without check-in, marks them `no-show`, and sends an apology + rescheduling offer to the patient.

---

### Waitlist Management
| | |
|---|---|
| **Route** | `GET /api/cron/waitlist-management` |
| **Schedule** | `5,20,35,50 * * * *` — every 15 minutes |
| **Priority** | Medium |
| **Lib** | `lib/automations/waitlist-management.ts` |

When a slot is cancelled, automatically offers it to the next patient on the waitlist via SMS/email.

---

### Follow-Up Scheduling
| | |
|---|---|
| **Route** | `GET /api/cron/followup-scheduling` |
| **Schedule** | `0 11 * * *` — 11:00 UTC daily (19:00 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/followup-scheduling.ts` |

Auto-schedules follow-up appointments for patients whose visit notes indicate a follow-up is needed.

---

### Visit Follow-Up Reminders
| | |
|---|---|
| **Route** | `GET /api/cron/visit-followup` |
| **Schedule** | `0 8 * * *` — 08:00 UTC daily (16:00 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/visit-followup.ts` |

Reads `treatmentPlan.followUp.date` on closed visits. Sends a reminder SMS and email 2 days before the date. Sets `reminderSent: true` on the visit to prevent duplicates.

---

### Recurring Appointments
| | |
|---|---|
| **Route** | `GET /api/cron/recurring-appointments` |
| **Schedule** | `0 13 * * *` — 13:00 UTC daily (21:00 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/recurring-appointments.ts` |

Automatically creates the next appointment in a recurring series when the current one approaches.

---

### Auto-Cancellation Policies
| | |
|---|---|
| **Route** | `GET /api/cron/auto-cancellation-policies` |
| **Schedule** | `30 10 * * *` — 10:30 UTC daily (18:30 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/auto-cancellation-policies.ts` |

Applies progressive actions for chronic no-show patients (warning → temporary suspension → cancellation).

---

### Smart Appointment Assignment
| | |
|---|---|
| **Route** | `GET /api/cron/smart-assignment` |
| **Schedule** | `0 */1 * * *` — every hour |
| **Priority** | High |
| **Lib** | `lib/automations/smart-assignment.ts` |

Auto-assigns unassigned appointments to doctors based on workload, specialization, and real-time availability.

---

## Clinical Automations

### Medication Reminders
| | |
|---|---|
| **Route** | `GET /api/cron/medication-reminders` |
| **Schedule** | `0 8,12,16,20 * * *` — 4× daily (08:00, 12:00, 16:00, 20:00 UTC) |
| **Priority** | High |
| **Lib** | `lib/automations/medication-adherence.ts` |

Sends medication dose reminders to patients based on their active prescriptions and dosing schedule.

---

### Prescription Refills
| | |
|---|---|
| **Route** | `GET /api/cron/prescription-refills` |
| **Schedule** | `0 9 * * *` — 09:00 UTC daily (17:00 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/prescription-refills.ts` |

Identifies prescriptions nearing depletion and sends refill reminders to patients.

---

### Prescription Expiry Warnings
| | |
|---|---|
| **Route** | `GET /api/cron/prescription-expiry-warnings` |
| **Schedule** | `5 8 * * *` — 08:05 UTC daily (16:05 PHT) |
| **Priority** | High |
| **Lib** | `lib/automations/prescription-expiry-warnings.ts` |

Alerts patients when their active prescriptions are about to expire so they can renew in time.

---

### Lab Result Notifications
| | |
|---|---|
| **Route** | `GET /api/cron/lab-notifications` |
| **Schedule** | `*/30 * * * *` — every 30 minutes |
| **Priority** | High |
| **Lib** | `lib/automations/lab-notifications.ts` |

Polls for completed or reviewed lab results where `notificationSent` is not yet `true`. Dispatches SMS, email, and in-app notifications to the patient. Processes up to 50 results per run to stay within rate limits.

---

### Referral Follow-Up Tracker
| | |
|---|---|
| **Route** | `GET /api/cron/referral-followup` |
| **Schedule** | `0 9 * * *` — 09:00 UTC daily (17:00 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/referral-followup.ts` |

Two actions per run:
1. **Reminders** — sends SMS/email to patients whose referral `followUpDate` is within 3 days.
2. **Escalations** — emails the referring doctor when an `urgent` or `stat` referral has been `pending` for 7+ days without acceptance.

---

### Health Reminders
| | |
|---|---|
| **Route** | `GET /api/cron/health-reminders` |
| **Schedule** | `0 12 * * *` — 12:00 UTC daily (20:00 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/health-reminders.ts` |

Sends preventive care reminders (annual checkups, vaccinations, screenings) based on patient age, gender, and medical history.

---

## Financial Automations

### Payment Reminders
| | |
|---|---|
| **Route** | `GET /api/cron/payment-reminders` |
| **Schedule** | `0 10 * * *` — 10:00 UTC daily (18:00 PHT) |
| **Priority** | High |
| **Lib** | `lib/automations/payment-reminders.ts` |

Sends reminders to patients with unpaid or partially paid invoices. Escalates based on overdue duration.

---

## Inventory Automations

### Inventory Alerts
| | |
|---|---|
| **Route** | `GET /api/cron/inventory-alerts` |
| **Schedule** | `0 8 * * *` — 08:00 UTC daily (16:00 PHT) |
| **Priority** | High |
| **Lib** | `lib/automations/inventory-alerts.ts` |

Generates alerts for items that have fallen below minimum stock levels or are fully out of stock.

---

### Inventory Reordering
| | |
|---|---|
| **Route** | `GET /api/cron/inventory-reordering` |
| **Schedule** | `15 9 * * *` — 09:15 UTC daily (17:15 PHT) |
| **Priority** | High |
| **Lib** | `lib/automations/inventory-reordering.ts` |

Auto-creates purchase orders when stock hits the configured reorder point. Avoids duplicate orders for the same item.

---

### Expiry Monitoring
| | |
|---|---|
| **Route** | `GET /api/cron/expiry-monitoring` |
| **Schedule** | `0 7 * * *` — 07:00 UTC daily (15:00 PHT) |
| **Priority** | High |
| **Lib** | `lib/automations/expiry-monitoring.ts` |

Monitors medicines and supplies nearing their expiration dates. Sends alerts at 90, 60, 30, and 7 days before expiry.

---

### Document Expiry Tracking
| | |
|---|---|
| **Route** | `GET /api/cron/document-expiry-tracking` |
| **Schedule** | `30 9 * * *` — 09:30 UTC daily (17:30 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/document-expiry-tracking.ts` |

Tracks expiring patient and staff documents (insurance cards, government IDs, medical certificates). Sends alerts before expiry.

---

## Patient Automations

### Birthday Greetings
| | |
|---|---|
| **Route** | `GET /api/cron/birthday-greetings` |
| **Schedule** | `0 0 * * *` — midnight UTC daily (08:00 PHT) |
| **Priority** | Low |
| **Lib** | `lib/automations/birthday-greetings.ts` |

Sends personalized birthday messages to patients on their birthday via SMS and/or email.

---

### Feedback Collection
| | |
|---|---|
| **Route** | `GET /api/cron/feedback-collection` |
| **Schedule** | `0 10 * * *` — 10:00 UTC daily (18:00 PHT) |
| **Priority** | Low |
| **Lib** | `lib/automations/feedback-collection.ts` |

Sends a satisfaction survey to patients 24 hours after a completed visit.

---

### Membership Expiry Reminders
| | |
|---|---|
| **Route** | `GET /api/cron/membership-expiry` |
| **Schedule** | `0 8 * * *` — 08:00 UTC daily (16:00 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/membership-expiry.ts` |

Two actions per run:
1. **Reminders** — sends SMS and email at **30, 14, 7, 3, and 1** days before membership expiry.
2. **Auto-expire** — bulk-updates memberships with `expiryDate < now` from `active` to `expired`.

---

### Patient Re-Engagement
| | |
|---|---|
| **Route** | `GET /api/cron/patient-reengagement` |
| **Schedule** | `0 10 * * 1` — 10:00 UTC every Monday (18:00 PHT) |
| **Priority** | Low |
| **Lib** | `lib/automations/patient-reengagement.ts` |

Identifies patients who have had no visit or confirmed appointment in the past **6 months** and sends a friendly re-engagement message. Processes up to 100 patients per run. Runs weekly to avoid over-contacting inactive patients.

---

### Insurance Verification
| | |
|---|---|
| **Route** | `GET /api/cron/insurance-verification` |
| **Schedule** | `10 8 * * *` — 08:10 UTC daily (16:10 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/insurance-verification.ts` |

Auto-verifies insurance coverage for upcoming appointments and flags those with issues for staff review.

---

## Reporting Automations

### Daily Reports
| | |
|---|---|
| **Route** | `GET /api/cron/daily-reports` |
| **Schedule** | `0 23 * * *` — 23:00 UTC daily (07:00 PHT next day) |
| **Priority** | Medium |
| **Lib** | `lib/automations/daily-reports.ts` |
| **Params** | `?date=YYYY-MM-DD` — report on a specific date |

Generates end-of-day clinic statistics (appointments, revenue, queue metrics, lab results) and emails them to admins.

---

### Weekly Reports
| | |
|---|---|
| **Route** | `GET /api/cron/weekly-reports` |
| **Schedule** | `0 8 * * 1` — 08:00 UTC every Monday (16:00 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/periodic-reports.ts` |

Generates a weekly summary covering appointments, revenue, patient flow, and staff activity for the past 7 days.

---

### Monthly Reports
| | |
|---|---|
| **Route** | `GET /api/cron/monthly-reports` |
| **Schedule** | `0 8 1 * *` — 08:00 UTC on the 1st of each month (16:00 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/periodic-reports.ts` |

Generates a comprehensive monthly report with trends, revenue analysis, and top diagnoses.

---

### Staff Performance Reports
| | |
|---|---|
| **Routes** | `GET /api/cron/weekly-staff-performance` · `GET /api/cron/monthly-staff-performance` |
| **Schedule** | Weekly: `0 9 * * 1` — Monthly: `0 9 1 * *` |
| **Priority** | Low |
| **Lib** | `lib/automations/staff-performance.ts` |

Compiles per-doctor and per-staff metrics (patients seen, average consultation time, no-show rate) and distributes to clinic managers.

---

## Operations Automations

### End-of-Day Cleanup
| | |
|---|---|
| **Route** | `GET /api/cron/end-of-day-cleanup` |
| **Schedule** | `0 10 * * *` — 10:00 UTC daily (**18:00 PHT / 6 PM**) |
| **Priority** | High |
| **Lib** | `lib/automations/end-of-day-cleanup.ts` |
| **Params** | `?date=YYYY-MM-DD` · `?queueStatus=cancelled` · `?appointmentStatus=cancelled` |

Closes all open records at the end of each clinic day:
- **Queue entries** with status `waiting` or `in-progress` → set to `completed` (with `completedAt` timestamp and `completionNotes`)
- **Appointments** with status `pending`, `scheduled`, or `confirmed` → set to `completed`

Defaults to `completed`; pass `?queueStatus=cancelled` or `?appointmentStatus=cancelled` to override.

---

### Queue Optimization
| | |
|---|---|
| **Route** | `GET /api/cron/queue-optimization` |
| **Schedule** | `*/15 * * * *` — every 15 minutes |
| **Priority** | Medium |
| **Lib** | `lib/automations/queue-optimization.ts` |

Reorders the active queue based on priority, wait time, doctor availability, and room assignments.

---

### Backup
| | |
|---|---|
| **Route** | `GET /api/cron/backup` |
| **Schedule** | `0 2 * * *` — 02:00 UTC daily (10:00 PHT) |
| **Priority** | High |

Triggers a database backup and stores it in the configured storage provider.

---

### Data Retention
| | |
|---|---|
| **Route** | `GET /api/cron/data-retention` |
| **Schedule** | `0 2 * * 0` — 02:00 UTC every Sunday (10:00 PHT) |
| **Priority** | Low |
| **Lib** | `lib/automations/data-retention.ts` |

Applies configured data retention policies — anonymizes or archives records older than the defined retention period in compliance with PH DPA.

---

### Trial Expiration
| | |
|---|---|
| **Route** | `GET /api/cron/trial-expiration` |
| **Schedule** | `0 6 * * *` — 06:00 UTC daily (14:00 PHT) |
| **Priority** | High |
| **Lib** | `lib/automations/trial-expiration.ts` |

Checks tenant trial periods. Sends warning emails at 7, 3, and 1 day(s) before expiry. Suspends access for tenants whose trial has ended without upgrading.

---

### Usage Alerts
| | |
|---|---|
| **Route** | `GET /api/cron/usage-alerts` |
| **Schedule** | `0 9 * * *` — 09:00 UTC daily (17:00 PHT) |
| **Priority** | Medium |
| **Lib** | `lib/automations/usage-alerts.ts` |

Monitors subscription usage metrics (patients, storage, API calls) and alerts clinic admins when approaching plan limits.

---

## Schedule Summary

> All times are UTC. Add **+8 hours** for Philippine Time (PHT).

| Frequency | Automations |
|---|---|
| **Every 15 min** | Queue Optimization, Waitlist Management |
| **Every 30 min** | No-Show Handling, Lab Notifications |
| **Hourly** | Smart Appointment Assignment |
| **4× daily** | Medication Reminders |
| **Daily** | Appointment Reminders, Payment Reminders, Inventory Alerts, Expiry Monitoring, Membership Expiry, Visit Follow-Up, Prescription Refills, Prescription Expiry Warnings, Insurance Verification, Health Reminders, Birthday Greetings, Feedback Collection, Follow-Up Scheduling, Recurring Appointments, Auto-Cancellation Policies, End-of-Day Cleanup, Referral Follow-Up, Document Expiry Tracking, Inventory Reordering, Daily Reports, Trial Expiration, Usage Alerts, Backup |
| **Weekly (Mon)** | Weekly Reports, Staff Performance (Weekly), Patient Re-Engagement |
| **Monthly (1st)** | Monthly Reports, Staff Performance (Monthly) |
| **Weekly (Sun)** | Data Retention |

---

## Adding a New Automation

1. **Create the lib module** in `lib/automations/your-automation.ts`
   - Export a primary function, e.g. `processYourAutomation(tenantId?)`
   - Return a typed result object with counts and errors

2. **Create the cron route** at `app/api/cron/your-automation/route.ts`
   - Copy the auth boilerplate from any existing route
   - Call your lib function and return a JSON response

3. **Register in `vercel.json`**
   ```json
   {
     "path": "/api/cron/your-automation",
     "schedule": "0 9 * * *"
   }
   ```

4. **Register in `lib/automations/registry.ts`**
   ```ts
   'your-automation': {
     id: 'your-automation',
     name: 'Your Automation',
     description: 'What it does',
     enabled: true,
     schedule: '0 9 * * *',
     category: 'operations',
     priority: 'medium',
   },
   ```

5. **Add to this doc** under the appropriate category section.
