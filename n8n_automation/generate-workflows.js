/**
 * n8n Workflow Generator
 * Generates JSON workflows for all clinic management automations
 * 
 * Usage: node generate-workflows.js
 * This will create all workflow JSON files in the current directory
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

// Base workflow template
function createWorkflowTemplate(name, schedule, endpoint, description) {
  // Determine schedule type
  let scheduleConfig;
  if (schedule.includes('*/')) {
    // Every X minutes/hours
    const match = schedule.match(/\*\/(\d+)/);
    if (match) {
      const interval = parseInt(match[1]);
      if (schedule.includes('* * * *')) {
        scheduleConfig = {
          interval: [{
            field: "minutes",
            minutesInterval: interval
          }]
        };
      }
    }
  } else if (schedule.includes(',')) {
    // Multiple times (e.g., "0 8,12,16,20 * * *")
    scheduleConfig = {
      interval: [{
        field: "cronExpression",
        expression: schedule
      }]
    };
  } else {
    // Cron expression
    scheduleConfig = {
      interval: [{
        field: "cronExpression",
        expression: schedule
      }]
    };
  }

  return {
    name: name,
    nodes: [
      {
        parameters: {
          rule: scheduleConfig
        },
        id: "schedule-trigger",
        name: `Schedule Trigger`,
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.1,
        position: [240, 300]
      },
      {
        parameters: {
          method: "GET",
          url: `={{ $env.APP_BASE_URL || 'https://your-app.vercel.app' }}${endpoint}`,
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "Authorization",
                value: "=Bearer {{ $env.CRON_SECRET }}"
              }
            ]
          },
          options: {
            timeout: 60000
          }
        },
        id: "http-request",
        name: "Call Automation API",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.1,
        position: [460, 300]
      },
      {
        parameters: {
          conditions: {
            number: [
              {
                value1: "={{ $json.status }}",
                operation: "equal",
                value2: 200
              }
            ]
          }
        },
        id: "check-success",
        name: "Check Success",
        type: "n8n-nodes-base.if",
        typeVersion: 1,
        position: [680, 300]
      },
      {
        parameters: {
          jsCode: `// Log success
const response = $input.item.json.body?.data || $input.item.json.body || {};
console.log('${name} completed:', JSON.stringify(response, null, 2));
return { json: { success: true, data: response, message: '${name} completed successfully' } };`
        },
        id: "log-success",
        name: "Log Success",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [900, 200]
      },
      {
        parameters: {
          jsCode: `// Log error
const error = $input.item.json.body?.error || $input.item.json.error || 'Unknown error';
console.error('${name} failed:', error);
return { json: { success: false, error: error } };`
        },
        id: "log-error",
        name: "Log Error",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [900, 400]
      }
    ],
    connections: {
      "Schedule Trigger": {
        main: [[
          {
            node: "Call Automation API",
            type: "main",
            index: 0
          }
        ]]
      },
      "Call Automation API": {
        main: [[
          {
            node: "Check Success",
            type: "main",
            index: 0
          }
        ]]
      },
      "Check Success": {
        main: [
          [[
            {
              node: "Log Success",
              type: "main",
              index: 0
            }
          ]],
          [[
            {
              node: "Log Error",
              type: "main",
              index: 0
            }
          ]]
        ]
      }
    },
    pinData: {},
    settings: {
      executionOrder: "v1"
    },
    staticData: null,
    tags: [
      {
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        id: "automation",
        name: "Automation"
      }
    ],
    triggerCount: 0,
    updatedAt: "2024-01-01T00:00:00.000Z",
    versionId: "1"
  };
}

// All workflows to generate
const workflows = [
  { id: "06", name: "Appointment Reminders", schedule: "0 9 * * *", endpoint: "/api/cron/reminders" },
  { id: "07", name: "Payment Reminders", schedule: "0 10 * * *", endpoint: "/api/cron/payment-reminders" },
  { id: "08", name: "Inventory Alerts", schedule: "0 8 * * *", endpoint: "/api/cron/inventory-alerts" },
  { id: "09", name: "Expiry Monitoring", schedule: "0 7 * * *", endpoint: "/api/cron/expiry-monitoring" },
  { id: "10", name: "Prescription Refills", schedule: "0 9 * * *", endpoint: "/api/cron/prescription-refills" },
  { id: "11", name: "Follow-up Scheduling", schedule: "0 11 * * *", endpoint: "/api/cron/followup-scheduling" },
  { id: "12", name: "Daily Reports", schedule: "0 23 * * *", endpoint: "/api/cron/daily-reports" },
  { id: "13", name: "No-Show Handling", schedule: "*/30 * * * *", endpoint: "/api/cron/no-show-handling" },
  { id: "14", name: "Waitlist Management", schedule: "*/15 * * * *", endpoint: "/api/cron/waitlist-management" },
  { id: "15", name: "Birthday Greetings", schedule: "0 8 * * *", endpoint: "/api/cron/birthday-greetings" },
  { id: "16", name: "Health Reminders", schedule: "0 12 * * *", endpoint: "/api/cron/health-reminders" },
  { id: "17", name: "Feedback Collection", schedule: "0 18 * * *", endpoint: "/api/cron/feedback-collection" },
  { id: "18", name: "Recurring Appointments", schedule: "0 13 * * *", endpoint: "/api/cron/recurring-appointments" },
  { id: "19", name: "Medication Reminders", schedule: "0 8,12,16,20 * * *", endpoint: "/api/cron/medication-reminders" },
  { id: "20", name: "Weekly Reports", schedule: "0 8 * * 1", endpoint: "/api/cron/weekly-reports" },
  { id: "21", name: "Monthly Reports", schedule: "0 8 1 * *", endpoint: "/api/cron/monthly-reports" },
  { id: "22", name: "Weekly Staff Performance", schedule: "0 9 * * 1", endpoint: "/api/cron/weekly-staff-performance" },
  { id: "23", name: "Monthly Staff Performance", schedule: "0 9 1 * *", endpoint: "/api/cron/monthly-staff-performance" },
  { id: "24", name: "Trial Expiration", schedule: "0 6 * * *", endpoint: "/api/cron/trial-expiration" },
  { id: "25", name: "Usage Alerts", schedule: "0 9 * * *", endpoint: "/api/cron/usage-alerts" },
  { id: "26", name: "Insurance Verification", schedule: "0 8 * * *", endpoint: "/api/cron/insurance-verification" },
  { id: "27", name: "Queue Optimization", schedule: "*/15 * * * *", endpoint: "/api/cron/queue-optimization" },
  { id: "28", name: "Data Retention", schedule: "0 2 * * 0", endpoint: "/api/cron/data-retention" }
];

// Generate workflows (skip if files already exist to preserve manual edits)
console.log('Generating n8n workflows...\n');

workflows.forEach(workflow => {
  const filename = `${workflow.id.padStart(2, '0')}-${workflow.name.toLowerCase().replace(/\s+/g, '-')}.json`;
  const filepath = path.join(__dirname, filename);
  
  // Skip if file already exists
  if (fs.existsSync(filepath)) {
    console.log(`⏭️  Skipping ${filename} (already exists)`);
    return;
  }
  
  const workflowData = createWorkflowTemplate(
    workflow.name,
    workflow.schedule,
    workflow.endpoint,
    workflow.name
  );
  
  fs.writeFileSync(filepath, JSON.stringify(workflowData, null, 2));
  console.log(`✅ Created ${filename}`);
});

console.log('\n✨ All workflows generated!');
console.log('\nNext steps:');
console.log('1. Import workflows into n8n');
console.log('2. Configure APP_BASE_URL and CRON_SECRET environment variables');
console.log('3. Adjust schedules if needed');
console.log('4. Test each workflow');
