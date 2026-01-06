# n8n Automation Workflows

This folder contains n8n workflow JSON files for all clinic management automations.

## Import Instructions

1. Open n8n interface
2. Click "Workflows" → "Import from File"
3. Select the workflow JSON file you want to import
4. Configure the following credentials/settings:
   - `APP_BASE_URL`: Your application base URL (e.g., https://your-clinic-app.vercel.app)
   - `CRON_SECRET`: Your CRON_SECRET from environment variables

## Workflow Files

### Priority 1 - New Automations

1. **01-smart-appointment-assignment.json**
   - Auto-assigns doctors to unassigned appointments
   - Schedule: Hourly
   - Endpoint: `/api/cron/smart-assignment`

2. **02-inventory-reordering.json**
   - Auto-creates reorder requests for inventory
   - Schedule: Daily at 9:00 AM
   - Endpoint: `/api/cron/inventory-reordering`

3. **03-prescription-expiry-warnings.json**
   - Sends warnings before prescriptions expire
   - Schedule: Daily at 8:00 AM
   - Endpoint: `/api/cron/prescription-expiry-warnings`

4. **04-document-expiry-tracking.json**
   - Tracks and alerts on expiring documents
   - Schedule: Daily at 9:00 AM
   - Endpoint: `/api/cron/document-expiry-tracking`

5. **05-auto-cancellation-policies.json**
   - Applies progressive policies for no-shows
   - Schedule: Daily at 10:00 AM
   - Endpoint: `/api/cron/auto-cancellation-policies`

### Existing Automations

6. **06-appointment-reminders.json**
   - Sends appointment reminders
   - Schedule: Daily at 9:00 AM
   - Endpoint: `/api/cron/reminders`

7. **07-payment-reminders.json**
   - Sends payment reminders
   - Schedule: Daily at 10:00 AM
   - Endpoint: `/api/cron/payment-reminders`

8. **08-inventory-alerts.json**
   - Sends inventory alerts
   - Schedule: Daily at 8:00 AM
   - Endpoint: `/api/cron/inventory-alerts`

9. **09-expiry-monitoring.json**
   - Monitors expiring inventory
   - Schedule: Daily at 7:00 AM
   - Endpoint: `/api/cron/expiry-monitoring`

10. **10-prescription-refills.json**
    - Reminds patients to refill prescriptions
    - Schedule: Daily at 9:00 AM
    - Endpoint: `/api/cron/prescription-refills`

11. **11-followup-scheduling.json**
    - Auto-schedules follow-up appointments
    - Schedule: Daily at 11:00 AM
    - Endpoint: `/api/cron/followup-scheduling`

12. **12-daily-reports.json**
    - Generates daily reports
    - Schedule: Daily at 11:00 PM
    - Endpoint: `/api/cron/daily-reports`

13. **13-no-show-handling.json**
    - Handles no-show appointments
    - Schedule: Every 30 minutes
    - Endpoint: `/api/cron/no-show-handling`

14. **14-waitlist-management.json**
    - Manages waitlist
    - Schedule: Every 15 minutes
    - Endpoint: `/api/cron/waitlist-management`

15. **15-birthday-greetings.json**
    - Sends birthday greetings
    - Schedule: Daily at 8:00 AM
    - Endpoint: `/api/cron/birthday-greetings`

16. **16-health-reminders.json**
    - Sends health reminders
    - Schedule: Daily at 12:00 PM
    - Endpoint: `/api/cron/health-reminders`

17. **17-feedback-collection.json**
    - Collects patient feedback
    - Schedule: Daily at 6:00 PM
    - Endpoint: `/api/cron/feedback-collection`

18. **18-recurring-appointments.json**
    - Processes recurring appointments
    - Schedule: Daily at 1:00 PM
    - Endpoint: `/api/cron/recurring-appointments`

19. **19-medication-reminders.json**
    - Sends medication reminders (4x daily)
    - Schedule: 8:00 AM, 12:00 PM, 4:00 PM, 8:00 PM
    - Endpoint: `/api/cron/medication-reminders`

20. **20-weekly-reports.json**
    - Generates weekly reports
    - Schedule: Mondays at 8:00 AM
    - Endpoint: `/api/cron/weekly-reports`

21. **21-monthly-reports.json**
    - Generates monthly reports
    - Schedule: 1st of month at 8:00 AM
    - Endpoint: `/api/cron/monthly-reports`

22. **22-weekly-staff-performance.json**
    - Generates weekly staff performance reports
    - Schedule: Mondays at 9:00 AM
    - Endpoint: `/api/cron/weekly-staff-performance`

23. **23-monthly-staff-performance.json**
    - Generates monthly staff performance reports
    - Schedule: 1st of month at 9:00 AM
    - Endpoint: `/api/cron/monthly-staff-performance`

24. **24-trial-expiration.json**
    - Monitors trial expiration
    - Schedule: Daily at 6:00 AM
    - Endpoint: `/api/cron/trial-expiration`

25. **25-usage-alerts.json**
    - Sends usage alerts
    - Schedule: Daily at 9:00 AM
    - Endpoint: `/api/cron/usage-alerts`

26. **26-insurance-verification.json**
    - Verifies insurance
    - Schedule: Daily at 8:00 AM
    - Endpoint: `/api/cron/insurance-verification`

27. **27-queue-optimization.json**
    - Optimizes patient queue
    - Schedule: Every 15 minutes
    - Endpoint: `/api/cron/queue-optimization`

28. **28-data-retention.json**
    - Applies data retention policies
    - Schedule: Sundays at 2:00 AM
    - Endpoint: `/api/cron/data-retention`

## Configuration

Before importing workflows, set up:

1. **Environment Variables in n8n**:
   - `APP_BASE_URL`: Your application URL
   - `CRON_SECRET`: Your cron authentication secret

2. **Workflow Settings**:
   - Set appropriate schedules for each workflow
   - Adjust error handling as needed
   - Configure notifications/alerting

## Usage

After importing, each workflow will:
1. Execute at its scheduled time
2. Call the appropriate API endpoint
3. Handle errors gracefully
4. Log results for monitoring

## Monitoring

Monitor workflow execution in n8n:
- View execution history
- Check for errors
- Review execution logs
- Set up alerts for failures
