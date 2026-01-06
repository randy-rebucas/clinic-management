/**
 * Helper script to generate n8n workflow templates
 * This is a reference - actual workflows are created manually for better customization
 */

const workflows = [
  {
    id: "06",
    name: "Appointment Reminders",
    schedule: "0 9 * * *",
    endpoint: "/api/cron/reminders",
    description: "Sends appointment reminders"
  },
  {
    id: "07",
    name: "Payment Reminders",
    schedule: "0 10 * * *",
    endpoint: "/api/cron/payment-reminders",
    description: "Sends payment reminders"
  },
  {
    id: "08",
    name: "Inventory Alerts",
    schedule: "0 8 * * *",
    endpoint: "/api/cron/inventory-alerts",
    description: "Sends inventory alerts"
  },
  {
    id: "09",
    name: "Expiry Monitoring",
    schedule: "0 7 * * *",
    endpoint: "/api/cron/expiry-monitoring",
    description: "Monitors expiring inventory"
  },
  {
    id: "10",
    name: "Prescription Refills",
    schedule: "0 9 * * *",
    endpoint: "/api/cron/prescription-refills",
    description: "Reminds patients to refill prescriptions"
  },
  {
    id: "11",
    name: "Follow-up Scheduling",
    schedule: "0 11 * * *",
    endpoint: "/api/cron/followup-scheduling",
    description: "Auto-schedules follow-up appointments"
  },
  {
    id: "12",
    name: "Daily Reports",
    schedule: "0 23 * * *",
    endpoint: "/api/cron/daily-reports",
    description: "Generates daily reports"
  },
  {
    id: "13",
    name: "No-Show Handling",
    schedule: "*/30 * * * *",
    endpoint: "/api/cron/no-show-handling",
    description: "Handles no-show appointments"
  },
  {
    id: "14",
    name: "Waitlist Management",
    schedule: "*/15 * * * *",
    endpoint: "/api/cron/waitlist-management",
    description: "Manages waitlist"
  },
  {
    id: "15",
    name: "Birthday Greetings",
    schedule: "0 8 * * *",
    endpoint: "/api/cron/birthday-greetings",
    description: "Sends birthday greetings"
  },
  {
    id: "16",
    name: "Health Reminders",
    schedule: "0 12 * * *",
    endpoint: "/api/cron/health-reminders",
    description: "Sends health reminders"
  },
  {
    id: "17",
    name: "Feedback Collection",
    schedule: "0 18 * * *",
    endpoint: "/api/cron/feedback-collection",
    description: "Collects patient feedback"
  },
  {
    id: "18",
    name: "Recurring Appointments",
    schedule: "0 13 * * *",
    endpoint: "/api/cron/recurring-appointments",
    description: "Processes recurring appointments"
  },
  {
    id: "19",
    name: "Medication Reminders",
    schedule: "0 8,12,16,20 * * *",
    endpoint: "/api/cron/medication-reminders",
    description: "Sends medication reminders (4x daily)"
  },
  {
    id: "20",
    name: "Weekly Reports",
    schedule: "0 8 * * 1",
    endpoint: "/api/cron/weekly-reports",
    description: "Generates weekly reports"
  },
  {
    id: "21",
    name: "Monthly Reports",
    schedule: "0 8 1 * *",
    endpoint: "/api/cron/monthly-reports",
    description: "Generates monthly reports"
  },
  {
    id: "22",
    name: "Weekly Staff Performance",
    schedule: "0 9 * * 1",
    endpoint: "/api/cron/weekly-staff-performance",
    description: "Generates weekly staff performance reports"
  },
  {
    id: "23",
    name: "Monthly Staff Performance",
    schedule: "0 9 1 * *",
    endpoint: "/api/cron/monthly-staff-performance",
    description: "Generates monthly staff performance reports"
  },
  {
    id: "24",
    name: "Trial Expiration",
    schedule: "0 6 * * *",
    endpoint: "/api/cron/trial-expiration",
    description: "Monitors trial expiration"
  },
  {
    id: "25",
    name: "Usage Alerts",
    schedule: "0 9 * * *",
    endpoint: "/api/cron/usage-alerts",
    description: "Sends usage alerts"
  },
  {
    id: "26",
    name: "Insurance Verification",
    schedule: "0 8 * * *",
    endpoint: "/api/cron/insurance-verification",
    description: "Verifies insurance"
  },
  {
    id: "27",
    name: "Queue Optimization",
    schedule: "*/15 * * * *",
    endpoint: "/api/cron/queue-optimization",
    description: "Optimizes patient queue"
  },
  {
    id: "28",
    name: "Data Retention",
    schedule: "0 2 * * 0",
    endpoint: "/api/cron/data-retention",
    description: "Applies data retention policies"
  }
];

// This is a reference file - actual JSON workflows created separately
