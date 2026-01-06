# n8n Automation Setup Guide

This guide will help you set up and configure n8n workflows for your clinic management system automations.

## Prerequisites

1. **n8n Installation**
   - Install n8n (Docker, npm, or self-hosted)
   - Access n8n interface (usually http://localhost:5678)

2. **Application Access**
   - Your clinic management application must be deployed
   - You need the `CRON_SECRET` from your application's environment variables
   - Know your application's base URL (e.g., https://your-app.vercel.app)

## Setup Steps

### 1. Configure Environment Variables in n8n

1. Open n8n Settings
2. Go to "Environment Variables" or "Credentials"
3. Add the following variables:

```
APP_BASE_URL=https://your-clinic-app.vercel.app
CRON_SECRET=your-cron-secret-from-env
```

**Note**: Replace with your actual values!

### 2. Import Workflows

#### Option A: Import Individual Workflows

1. In n8n, click "Workflows" → "Import from File"
2. Select a workflow JSON file from `n8n_automation/` folder
3. Repeat for each workflow you want to use

#### Option B: Import All at Once

1. Use n8n's bulk import feature (if available)
2. Or import workflows one by one

### 3. Configure Workflows

After importing, each workflow needs minimal configuration:

1. **Review Schedule Triggers**
   - Each workflow has a schedule trigger
   - Verify the schedule matches your needs
   - Adjust if necessary in the "Schedule Trigger" node

2. **Verify API Endpoint**
   - Check the HTTP Request node
   - Ensure `APP_BASE_URL` is correctly referenced
   - Verify the endpoint path is correct

3. **Set Up Authentication**
   - The HTTP Request nodes use Header Authentication
   - They automatically use `CRON_SECRET` from environment variables
   - No additional configuration needed if env vars are set

### 4. Test Workflows

Before activating:

1. **Manual Test**
   - Click "Execute Workflow" button
   - Check execution log for errors
   - Verify API response is successful

2. **Verify Authentication**
   - Check that API returns 200 status
   - If 401, verify CRON_SECRET is correct

3. **Check Logs**
   - Review success/error logs
   - Ensure data is processed correctly

## Workflow Details

### Priority 1 - New Automations

These are the newly implemented automations:

1. **01-smart-appointment-assignment.json**
   - **Schedule**: Hourly
   - **Function**: Auto-assigns doctors to appointments
   - **Endpoint**: `/api/cron/smart-assignment`

2. **02-inventory-reordering.json**
   - **Schedule**: Daily at 9:00 AM
   - **Function**: Creates inventory reorder requests
   - **Endpoint**: `/api/cron/inventory-reordering`

3. **03-prescription-expiry-warnings.json**
   - **Schedule**: Daily at 8:00 AM
   - **Function**: Sends prescription expiry warnings
   - **Endpoint**: `/api/cron/prescription-expiry-warnings`

4. **04-document-expiry-tracking.json**
   - **Schedule**: Daily at 9:00 AM
   - **Function**: Tracks expiring documents
   - **Endpoint**: `/api/cron/document-expiry-tracking`

5. **05-auto-cancellation-policies.json**
   - **Schedule**: Daily at 10:00 AM
   - **Function**: Applies cancellation policies
   - **Endpoint**: `/api/cron/auto-cancellation-policies`

### Existing Automations

All 23 existing automations are also included with their respective schedules.

## Advanced Configuration

### Custom Notifications

Some workflows include optional Telegram notification nodes (disabled by default):

1. Enable the Telegram node
2. Configure Telegram credentials in n8n
3. Set chat ID for notifications

### Error Handling

All workflows include:
- Success/Error checking
- Logging nodes for debugging
- Graceful error handling

### Monitoring

Monitor workflow execution:
1. Check n8n execution history
2. Review logs in Code nodes
3. Set up alerts for failures (optional)

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check CRON_SECRET is correct
   - Verify Authorization header format
   - Ensure secret matches application config

2. **404 Not Found**
   - Verify APP_BASE_URL is correct
   - Check endpoint path is correct
   - Ensure application is deployed

3. **Timeout Errors**
   - Increase timeout in HTTP Request node (default: 60s)
   - Check application performance
   - Verify cron endpoint is responding

4. **Schedule Not Working**
   - Verify schedule trigger is active
   - Check cron expression syntax
   - Ensure workflow is active in n8n

### Debugging Tips

1. **Enable Execution Data**
   - In workflow settings, enable "Save Execution Data"
   - This helps debug issues

2. **Check API Response**
   - Use HTTP Request node's response
   - Check status codes
   - Review response body

3. **Test Manually**
   - Use "Execute Workflow" button
   - Test individual nodes
   - Verify data flow

## Best Practices

1. **Start Small**
   - Import and test one workflow first
   - Verify it works before importing all

2. **Monitor Initially**
   - Watch workflows for first few days
   - Check for errors
   - Adjust schedules if needed

3. **Backup Workflows**
   - Export workflows after configuration
   - Keep backups of working configurations

4. **Document Custom Changes**
   - Note any custom modifications
   - Update README if needed

## Schedule Reference

| Time | Automation | Frequency |
|------|-----------|-----------|
| 6:00 AM | Trial Expiration | Daily |
| 7:00 AM | Expiry Monitoring | Daily |
| 8:00 AM | Inventory Alerts | Daily |
| 8:00 AM | Birthday Greetings | Daily |
| 8:00 AM | Insurance Verification | Daily |
| 8:00 AM | Prescription Expiry Warnings | Daily |
| 8:00 AM | Usage Alerts | Daily |
| 8:00 AM, 12:00 PM, 4:00 PM, 8:00 PM | Medication Reminders | 4x Daily |
| 9:00 AM | Appointment Reminders | Daily |
| 9:00 AM | Inventory Reordering | Daily |
| 9:00 AM | Document Expiry Tracking | Daily |
| 9:00 AM | Prescription Refills | Daily |
| 10:00 AM | Payment Reminders | Daily |
| 10:00 AM | Auto-Cancellation Policies | Daily |
| 11:00 AM | Follow-up Scheduling | Daily |
| 12:00 PM | Health Reminders | Daily |
| 1:00 PM | Recurring Appointments | Daily |
| 6:00 PM | Feedback Collection | Daily |
| 9:00 AM (Mon) | Weekly Reports | Weekly |
| 9:00 AM (Mon) | Weekly Staff Performance | Weekly |
| 8:00 AM (1st) | Monthly Reports | Monthly |
| 9:00 AM (1st) | Monthly Staff Performance | Monthly |
| Every 15 min | Waitlist Management | Continuous |
| Every 15 min | Queue Optimization | Continuous |
| Every 30 min | No-Show Handling | Continuous |
| Hourly | Smart Appointment Assignment | Continuous |
| 11:00 PM | Daily Reports | Daily |
| 2:00 AM (Sun) | Data Retention | Weekly |

## Support

For issues:
1. Check application logs
2. Review n8n execution logs
3. Verify API endpoints are working
4. Check environment variables

## Next Steps

After setup:
1. Test all workflows
2. Monitor for 24-48 hours
3. Adjust schedules as needed
4. Configure notifications (optional)
5. Set up monitoring/alerts
