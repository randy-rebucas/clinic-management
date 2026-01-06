# n8n Workflow Import Checklist

Use this checklist when importing workflows into n8n.

## Pre-Import Setup

- [ ] n8n is installed and running
- [ ] n8n interface is accessible
- [ ] You have admin access to n8n
- [ ] Application is deployed and accessible
- [ ] You have `CRON_SECRET` from application environment variables
- [ ] You know the application base URL

## Environment Variables Configuration

- [ ] Set `APP_BASE_URL` in n8n environment variables
- [ ] Set `CRON_SECRET` in n8n environment variables
- [ ] Verified variables are accessible in workflows

## Import Priority 1 Workflows (New Automations)

- [ ] `01-smart-appointment-assignment.json`
- [ ] `02-inventory-reordering.json`
- [ ] `03-prescription-expiry-warnings.json`
- [ ] `04-document-expiry-tracking.json`
- [ ] `05-auto-cancellation-policies.json`

## Import Existing Automation Workflows

- [ ] `06-appointment-reminders.json`
- [ ] `07-payment-reminders.json`
- [ ] `08-inventory-alerts.json`
- [ ] `09-expiry-monitoring.json`
- [ ] `10-prescription-refills.json`
- [ ] `11-followup-scheduling.json`
- [ ] `12-daily-reports.json`
- [ ] `13-no-show-handling.json`
- [ ] `14-waitlist-management.json`
- [ ] `15-birthday-greetings.json`
- [ ] `16-health-reminders.json`
- [ ] `17-feedback-collection.json`
- [ ] `18-recurring-appointments.json`
- [ ] `19-medication-reminders.json`
- [ ] `20-weekly-reports.json`
- [ ] `21-monthly-reports.json`
- [ ] `22-weekly-staff-performance.json`
- [ ] `23-monthly-staff-performance.json`
- [ ] `24-trial-expiration.json`
- [ ] `25-usage-alerts.json`
- [ ] `26-insurance-verification.json`
- [ ] `27-queue-optimization.json`
- [ ] `28-data-retention.json`

## Verification Steps (Repeat for Each Workflow)

### After Importing Each Workflow:

- [ ] Workflow imported without errors
- [ ] Schedule trigger is configured correctly
- [ ] HTTP Request node has correct URL
- [ ] Authentication header is properly configured
- [ ] Success/Error nodes are connected
- [ ] Workflow is saved

### Testing Each Workflow:

- [ ] Execute workflow manually (Execute button)
- [ ] Check execution log for success
- [ ] Verify API returns 200 status
- [ ] Check response data is correct
- [ ] Verify no errors in execution

## Post-Import Configuration

- [ ] All workflows are active
- [ ] Schedules are correct
- [ ] Error notifications configured (optional)
- [ ] Monitoring set up (optional)
- [ ] Execution data saving enabled (for debugging)

## Final Verification

- [ ] At least 5 workflows tested successfully
- [ ] Authentication working for all workflows
- [ ] No import errors
- [ ] All workflows showing correct schedules
- [ ] Documentation reviewed

## Monitoring (First 24 Hours)

- [ ] Check execution history
- [ ] Verify workflows running on schedule
- [ ] Monitor for errors
- [ ] Check application logs
- [ ] Verify automations are working in application

## Troubleshooting Checklist

If workflows fail:

- [ ] Check `APP_BASE_URL` is correct
- [ ] Verify `CRON_SECRET` matches application
- [ ] Check application is accessible
- [ ] Verify API endpoints are responding
- [ ] Check n8n execution logs
- [ ] Review application logs
- [ ] Test API endpoints manually (curl/Postman)

## Optional Enhancements

- [ ] Configure Telegram notifications for errors
- [ ] Set up Slack notifications (optional)
- [ ] Add email alerts for critical failures
- [ ] Create dashboard for workflow monitoring
- [ ] Set up workflow execution analytics

---

**Notes**:
- Import workflows gradually to catch issues early
- Test critical workflows first (reminders, alerts)
- Keep backups of configured workflows
- Document any custom changes

**Status**: Ready for import ✅
