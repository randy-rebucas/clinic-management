// Centralized Automation Registry
// Manages all automations, their schedules, and enable/disable status

export interface AutomationConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule: string; // Cron expression
  category: 'appointment' | 'financial' | 'inventory' | 'clinical' | 'patient' | 'reporting' | 'operations';
  priority: 'high' | 'medium' | 'low';
  lastRun?: Date;
  nextRun?: Date;
  successRate?: number;
  averageExecutionTime?: number; // milliseconds
}

/**
 * Centralized registry of all automations
 * This provides a single source of truth for automation configuration
 */
export const automationRegistry: Record<string, AutomationConfig> = {
  // Existing automations
  'appointment-reminders': {
    id: 'appointment-reminders',
    name: 'Appointment Reminders',
    description: 'Sends SMS/Email reminders 24 hours before appointments',
    enabled: true,
    schedule: '0 9 * * *',
    category: 'appointment',
    priority: 'high',
  },
  'payment-reminders': {
    id: 'payment-reminders',
    name: 'Payment Reminders',
    description: 'Sends reminders for overdue invoices',
    enabled: true,
    schedule: '0 10 * * *',
    category: 'financial',
    priority: 'high',
  },
  'inventory-alerts': {
    id: 'inventory-alerts',
    name: 'Inventory Alerts',
    description: 'Alerts for low stock and out-of-stock items',
    enabled: true,
    schedule: '0 8 * * *',
    category: 'inventory',
    priority: 'high',
  },
  'expiry-monitoring': {
    id: 'expiry-monitoring',
    name: 'Expiry Monitoring',
    description: 'Monitors and alerts on expiring inventory',
    enabled: true,
    schedule: '0 7 * * *',
    category: 'inventory',
    priority: 'high',
  },
  'prescription-refills': {
    id: 'prescription-refills',
    name: 'Prescription Refills',
    description: 'Reminds patients to refill prescriptions',
    enabled: true,
    schedule: '0 9 * * *',
    category: 'clinical',
    priority: 'medium',
  },
  'followup-scheduling': {
    id: 'followup-scheduling',
    name: 'Follow-up Scheduling',
    description: 'Auto-schedules follow-up appointments',
    enabled: true,
    schedule: '0 11 * * *',
    category: 'appointment',
    priority: 'medium',
  },
  'no-show-handling': {
    id: 'no-show-handling',
    name: 'No-Show Handling',
    description: 'Handles missed appointments',
    enabled: true,
    schedule: '*/30 * * * *',
    category: 'appointment',
    priority: 'medium',
  },
  'waitlist-management': {
    id: 'waitlist-management',
    name: 'Waitlist Management',
    description: 'Auto-fills cancelled slots from waitlist',
    enabled: true,
    schedule: '*/15 * * * *',
    category: 'appointment',
    priority: 'medium',
  },
  'birthday-greetings': {
    id: 'birthday-greetings',
    name: 'Birthday Greetings',
    description: 'Sends birthday wishes to patients',
    enabled: true,
    schedule: '0 8 * * *',
    category: 'patient',
    priority: 'low',
  },
  'health-reminders': {
    id: 'health-reminders',
    name: 'Health Reminders',
    description: 'Sends preventive care reminders',
    enabled: true,
    schedule: '0 12 * * *',
    category: 'patient',
    priority: 'medium',
  },
  'feedback-collection': {
    id: 'feedback-collection',
    name: 'Feedback Collection',
    description: 'Requests feedback after visits',
    enabled: true,
    schedule: '0 18 * * *',
    category: 'patient',
    priority: 'low',
  },
  'recurring-appointments': {
    id: 'recurring-appointments',
    name: 'Recurring Appointments',
    description: 'Auto-creates next appointment in series',
    enabled: true,
    schedule: '0 13 * * *',
    category: 'appointment',
    priority: 'medium',
  },
  'medication-reminders': {
    id: 'medication-reminders',
    name: 'Medication Reminders',
    description: 'Sends medication reminders (4x daily)',
    enabled: true,
    schedule: '0 8,12,16,20 * * *',
    category: 'clinical',
    priority: 'high',
  },
  'daily-reports': {
    id: 'daily-reports',
    name: 'Daily Reports',
    description: 'Generates daily clinic statistics',
    enabled: true,
    schedule: '0 23 * * *',
    category: 'reporting',
    priority: 'medium',
  },
  'weekly-reports': {
    id: 'weekly-reports',
    name: 'Weekly Reports',
    description: 'Weekly summary reports',
    enabled: true,
    schedule: '0 8 * * 1',
    category: 'reporting',
    priority: 'medium',
  },
  'monthly-reports': {
    id: 'monthly-reports',
    name: 'Monthly Reports',
    description: 'Monthly comprehensive reports',
    enabled: true,
    schedule: '0 8 1 * *',
    category: 'reporting',
    priority: 'medium',
  },
  'staff-performance': {
    id: 'staff-performance',
    name: 'Staff Performance Reports',
    description: 'Weekly and monthly performance metrics',
    enabled: true,
    schedule: '0 9 * * 1',
    category: 'reporting',
    priority: 'low',
  },
  'insurance-verification': {
    id: 'insurance-verification',
    name: 'Insurance Verification',
    description: 'Auto-verifies insurance for appointments',
    enabled: true,
    schedule: '0 8 * * *',
    category: 'operations',
    priority: 'medium',
  },
  'queue-optimization': {
    id: 'queue-optimization',
    name: 'Queue Optimization',
    description: 'Optimizes patient queue management',
    enabled: true,
    schedule: '*/15 * * * *',
    category: 'operations',
    priority: 'medium',
  },
  'data-retention': {
    id: 'data-retention',
    name: 'Data Retention',
    description: 'Applies data retention policies',
    enabled: true,
    schedule: '0 2 * * 0',
    category: 'operations',
    priority: 'low',
  },
  'trial-expiration': {
    id: 'trial-expiration',
    name: 'Trial Expiration',
    description: 'Monitors and alerts on trial expiration',
    enabled: true,
    schedule: '0 6 * * *',
    category: 'operations',
    priority: 'high',
  },
  'usage-alerts': {
    id: 'usage-alerts',
    name: 'Usage Alerts',
    description: 'Alerts on subscription usage limits',
    enabled: true,
    schedule: '0 9 * * *',
    category: 'operations',
    priority: 'medium',
  },
  
  // New Priority 1 automations
  'smart-appointment-assignment': {
    id: 'smart-appointment-assignment',
    name: 'Smart Appointment Assignment',
    description: 'Auto-assigns doctors based on workload, specialization, and availability',
    enabled: true,
    schedule: '0 */1 * * *', // Hourly
    category: 'appointment',
    priority: 'high',
  },
  'inventory-reordering': {
    id: 'inventory-reordering',
    name: 'Automatic Inventory Reordering',
    description: 'Auto-creates purchase orders when stock hits reorder point',
    enabled: true,
    schedule: '0 9 * * *',
    category: 'inventory',
    priority: 'high',
  },
  'prescription-expiry-warnings': {
    id: 'prescription-expiry-warnings',
    name: 'Prescription Expiry Warnings',
    description: 'Alerts patients before prescriptions expire',
    enabled: true,
    schedule: '0 8 * * *',
    category: 'clinical',
    priority: 'high',
  },
  'document-expiration-tracking': {
    id: 'document-expiration-tracking',
    name: 'Document Expiration Tracking',
    description: 'Tracks and alerts on expiring insurance cards, IDs, certificates',
    enabled: true,
    schedule: '0 9 * * *',
    category: 'operations',
    priority: 'medium',
  },
  'auto-cancellation-policies': {
    id: 'auto-cancellation-policies',
    name: 'Auto-Cancellation Policies',
    description: 'Progressive actions for chronic no-shows',
    enabled: true,
    schedule: '0 10 * * *',
    category: 'appointment',
    priority: 'medium',
  },

  // End-of-day operations
  'end-of-day-cleanup': {
    id: 'end-of-day-cleanup',
    name: 'End-of-Day Cleanup',
    description: 'Marks all active queue entries and pending appointments as completed at 6 PM',
    enabled: true,
    schedule: '0 10 * * *', // 10:00 UTC = 18:00 PHT
    category: 'operations',
    priority: 'high',
  },

  // Lab result notifications batch
  'lab-notifications': {
    id: 'lab-notifications',
    name: 'Lab Result Notifications',
    description: 'Notifies patients when their lab results are available (polls every 30 min)',
    enabled: true,
    schedule: '*/30 * * * *',
    category: 'clinical',
    priority: 'high',
  },

  // Membership expiry
  'membership-expiry': {
    id: 'membership-expiry',
    name: 'Membership Expiry Reminders',
    description: 'Sends renewal reminders at 30/14/7/3/1 days before expiry and auto-expires past-due memberships',
    enabled: true,
    schedule: '0 8 * * *',
    category: 'patient',
    priority: 'medium',
  },

  // Referral follow-up
  'referral-followup': {
    id: 'referral-followup',
    name: 'Referral Follow-Up Tracker',
    description: 'Reminds patients of upcoming referral follow-up dates and escalates stale urgent referrals',
    enabled: true,
    schedule: '0 9 * * *',
    category: 'clinical',
    priority: 'medium',
  },

  // Visit follow-up
  'visit-followup': {
    id: 'visit-followup',
    name: 'Visit Follow-Up Reminders',
    description: 'Sends reminders for upcoming follow-up dates set in the visit treatment plan',
    enabled: true,
    schedule: '0 8 * * *',
    category: 'appointment',
    priority: 'medium',
  },

  // Patient re-engagement
  'patient-reengagement': {
    id: 'patient-reengagement',
    name: 'Patient Re-Engagement',
    description: 'Sends friendly outreach to patients inactive for 6+ months to encourage rebooking',
    enabled: true,
    schedule: '0 10 * * 1', // Weekly on Monday
    category: 'patient',
    priority: 'low',
  },
};

/**
 * Get all enabled automations
 */
export function getEnabledAutomations(): AutomationConfig[] {
  return Object.values(automationRegistry).filter(automation => automation.enabled);
}

/**
 * Get automations by category
 */
export function getAutomationsByCategory(category: AutomationConfig['category']): AutomationConfig[] {
  return Object.values(automationRegistry).filter(
    automation => automation.category === category && automation.enabled
  );
}

/**
 * Get high priority automations
 */
export function getHighPriorityAutomations(): AutomationConfig[] {
  return Object.values(automationRegistry).filter(
    automation => automation.priority === 'high' && automation.enabled
  );
}

/**
 * Update automation status
 */
export function updateAutomationStatus(id: string, enabled: boolean): void {
  if (automationRegistry[id]) {
    automationRegistry[id].enabled = enabled;
  }
}

/**
 * Get automation by ID
 */
export function getAutomation(id: string): AutomationConfig | undefined {
  return automationRegistry[id];
}
