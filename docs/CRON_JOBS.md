# Cron Jobs

All 35 scheduled jobs are declared in [vercel.json](../vercel.json) and run as GET requests
to `/api/cron/<name>`. Every endpoint requires `Authorization: Bearer <CRON_SECRET>` when
called by an external scheduler, or the Vercel-platform `x-vercel-cron: 1` header when
invoked by Vercel Cron infrastructure.

## Auth reminder

Set `CRON_SECRET` in your environment. When calling manually (staging tests, curl):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/<name>
```

---

## Schedule reference

| Job | Schedule (UTC) | Frequency |
|---|---|---|
| `reminders` | `0 9 * * *` | Daily 09:00 |
| `queue-optimization` | `*/15 * * * *` | Every 15 min |
| `smart-assignment` | `0 */1 * * *` | Every hour |
| `waitlist-management` | `5,20,35,50 * * * *` | Every 15 min (offset 5) |
| `no-show-handling` | `10,40 * * * *` | Every 30 min |
| `medication-reminders` | `0 8,12,16,20 * * *` | Daily 08/12/16/20 |
| `daily-reports` | `0 23 * * *` | Daily 23:00 |
| `backup` | `0 2 * * *` | Daily 02:00 |
| `payment-reminders` | `0 10 * * *` | Daily 10:00 |
| `inventory-alerts` | `0 8 * * *` | Daily 08:00 |
| `inventory-reordering` | `15 9 * * *` | Daily 09:15 |
| `prescription-refills` | `0 9 * * *` | Daily 09:00 |
| `prescription-expiry-warnings` | `5 8 * * *` | Daily 08:05 |
| `insurance-verification` | `10 8 * * *` | Daily 08:10 |
| `followup-scheduling` | `0 11 * * *` | Daily 11:00 |
| `recurring-appointments` | `0 13 * * *` | Daily 13:00 |
| `auto-cancellation-policies` | `30 10 * * *` | Daily 10:30 |
| `health-reminders` | `0 12 * * *` | Daily 12:00 |
| `expiry-monitoring` | `0 7 * * *` | Daily 07:00 |
| `document-expiry-tracking` | `30 9 * * *` | Daily 09:30 |
| `end-of-day-cleanup` | `0 10 * * *` | Daily 10:00 |
| `birthday-greetings` | `0 0 * * *` | Daily 00:00 (midnight) |
| `feedback-collection` | `0 10 * * *` | Daily 10:00 |
| `weekly-reports` | `0 8 * * 1` | Monday 08:00 |
| `monthly-reports` | `0 8 1 * *` | 1st of month 08:00 |
| `weekly-staff-performance` | `0 9 * * 1` | Monday 09:00 |
| `monthly-staff-performance` | `0 9 1 * *` | 1st of month 09:00 |
| `trial-expiration` | `0 6 * * *` | Daily 06:00 |
| `usage-alerts` | `0 9 * * *` | Daily 09:00 |
| `data-retention` | `0 2 * * 0` | Sunday 02:00 |
| `lab-notifications` | `*/30 * * * *` | Every 30 min |
| `membership-expiry` | `0 8 * * *` | Daily 08:00 |
| `referral-followup` | `0 9 * * *` | Daily 09:00 |
| `visit-followup` | `0 8 * * *` | Daily 08:00 |
| `patient-reengagement` | `0 10 * * 1` | Monday 10:00 |

---

## Job descriptions

### Patient Care
| Job | What it does |
|---|---|
| `reminders` | Sends appointment reminders (SMS/email) for upcoming visits |
| `medication-reminders` | Notifies patients of scheduled medication times |
| `health-reminders` | Sends general health check-up reminders to eligible patients |
| `prescription-refills` | Alerts patients whose prescriptions are due for refill |
| `prescription-expiry-warnings` | Warns patients and staff of prescriptions expiring soon |
| `followup-scheduling` | Creates follow-up appointment tasks after completed visits |
| `visit-followup` | Sends post-visit follow-up messages to patients |
| `birthday-greetings` | Sends birthday messages to patients |
| `feedback-collection` | Requests satisfaction feedback after appointments |
| `patient-reengagement` | Identifies and re-engages inactive patients |
| `lab-notifications` | Notifies patients and doctors when lab results are ready |

### Appointments & Queue
| Job | What it does |
|---|---|
| `queue-optimization` | Rebalances the live patient queue for efficiency |
| `smart-assignment` | Auto-assigns patients to available doctors based on load |
| `waitlist-management` | Promotes waitlisted patients when slots open |
| `no-show-handling` | Marks patients as no-show and frees appointment slots |
| `recurring-appointments` | Generates next occurrence for recurring appointment templates |
| `auto-cancellation-policies` | Cancels appointments that breach cancellation policy rules |

### Clinical & Documents
| Job | What it does |
|---|---|
| `insurance-verification` | Batch-verifies insurance eligibility for upcoming appointments |
| `expiry-monitoring` | Monitors staff licences, certifications, and supply expiry dates |
| `document-expiry-tracking` | Flags patient and clinic documents nearing expiry |
| `referral-followup` | Follows up on open referrals that haven't been acknowledged |

### Inventory & Finance
| Job | What it does |
|---|---|
| `inventory-alerts` | Alerts staff when stock levels fall below minimum threshold |
| `inventory-reordering` | Triggers automatic reorder requests for low-stock items |
| `payment-reminders` | Sends overdue invoice reminders to patients |
| `membership-expiry` | Notifies patients whose membership plans are expiring |

### Reporting & Analytics
| Job | What it does |
|---|---|
| `daily-reports` | Generates and emails daily clinic summary reports |
| `weekly-reports` | Generates and emails weekly performance reports |
| `monthly-reports` | Generates and emails monthly analytics reports |
| `weekly-staff-performance` | Compiles weekly staff productivity metrics |
| `monthly-staff-performance` | Compiles monthly staff performance summaries |
| `usage-alerts` | Alerts tenant admins when subscription usage limits are near |

### System
| Job | What it does |
|---|---|
| `trial-expiration` | Processes expired trial tenants and sends expiry warnings |
| `data-retention` | Applies configured data-retention policies (purge/anonymise old records) |
| `backup` | Triggers a database backup and logs the result |
| `end-of-day-cleanup` | Cleans up transient records, expired sessions, and temp files |

---

## Monitoring

Add an external uptime check (e.g. [Better Uptime](https://betterstack.com/better-uptime),
UptimeRobot) pointing to `/api/health/live`. For individual job monitoring, call each endpoint
manually in staging after deploy and verify the `success: true` response.

Cron jobs that fail silently (return 200 but log errors) are caught by
`lib/logger.ts` — wire up `SENTRY_DSN` to surface them in error tracking.
