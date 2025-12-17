/**
 * Subscription Package Definitions and Limitations
 * Defines features and limitations for each subscription plan
 */

export type SubscriptionPlan = 'trial' | 'basic' | 'professional' | 'enterprise';

export interface SubscriptionLimitations {
  // Patient Limits
  maxPatients: number | null; // null = unlimited
  
  // User/Staff Limits
  maxUsers: number | null; // null = unlimited
  maxDoctors: number | null; // null = unlimited
  
  // Appointment Limits
  maxAppointmentsPerMonth: number | null; // null = unlimited
  maxAppointmentsPerDay: number | null; // null = unlimited
  
  // Visit Limits
  maxVisitsPerMonth: number | null; // null = unlimited
  
  // Storage Limits
  maxStorageGB: number | null; // null = unlimited
  maxFileSizeMB: number; // Maximum file upload size
  
  // Feature Flags
  features: {
    // Core Features
    patientManagement: boolean;
    appointmentScheduling: boolean;
    visitManagement: boolean;
    prescriptionManagement: boolean;
    labResults: boolean;
    inventoryManagement: boolean;
    billingInvoicing: boolean;
    
    // Advanced Features
    reportingAnalytics: boolean;
    customReports: boolean;
    apiAccess: boolean;
    webhooks: boolean;
    customIntegrations: boolean;
    
    // Communication Features
    smsNotifications: boolean;
    emailNotifications: boolean;
    broadcastMessaging: boolean;
    
    // Automation Features
    automations: boolean;
    customAutomations: boolean;
    
    // Support Features
    supportLevel: 'basic' | 'priority' | '24/7';
    phoneSupport: boolean;
    emailSupport: boolean;
    chatSupport: boolean;
    
    // Multi-location
    multiLocation: boolean;
    maxLocations: number | null; // null = unlimited
    
    // Data Export
    dataExport: boolean;
    bulkExport: boolean;
    
    // Customization
    customBranding: boolean;
    whiteLabel: boolean;
    
    // Security
    sso: boolean;
    mfa: boolean;
    auditLogs: boolean;
    
    // Backup
    automatedBackups: boolean;
    backupRetentionDays: number;
  };
  
  // Pricing
  price: {
    monthly: number;
    yearly?: number; // Optional yearly pricing
    currency: string;
  };
}

export const SUBSCRIPTION_PACKAGES: Record<SubscriptionPlan, SubscriptionLimitations> = {
  trial: {
    maxPatients: 50, // Limited trial
    maxUsers: 3,
    maxDoctors: 2,
    maxAppointmentsPerMonth: 100,
    maxAppointmentsPerDay: 20,
    maxVisitsPerMonth: 100,
    maxStorageGB: 1,
    maxFileSizeMB: 5,
    features: {
      patientManagement: true,
      appointmentScheduling: true,
      visitManagement: true,
      prescriptionManagement: true,
      labResults: true,
      inventoryManagement: true,
      billingInvoicing: true,
      reportingAnalytics: false, // Limited in trial
      customReports: false,
      apiAccess: false,
      webhooks: false,
      customIntegrations: false,
      smsNotifications: true, // Limited
      emailNotifications: true,
      broadcastMessaging: false,
      automations: true, // Basic automations only
      customAutomations: false,
      supportLevel: 'basic',
      phoneSupport: false,
      emailSupport: true,
      chatSupport: false,
      multiLocation: false,
      maxLocations: 1,
      dataExport: false,
      bulkExport: false,
      customBranding: false,
      whiteLabel: false,
      sso: false,
      mfa: false,
      auditLogs: false,
      automatedBackups: false,
      backupRetentionDays: 7,
    },
    price: {
      monthly: 0,
      currency: 'USD',
    },
  },
  
  basic: {
    maxPatients: 100,
    maxUsers: 5,
    maxDoctors: 3,
    maxAppointmentsPerMonth: 500,
    maxAppointmentsPerDay: 50,
    maxVisitsPerMonth: 500,
    maxStorageGB: 5,
    maxFileSizeMB: 10,
    features: {
      patientManagement: true,
      appointmentScheduling: true,
      visitManagement: true,
      prescriptionManagement: true,
      labResults: true,
      inventoryManagement: true,
      billingInvoicing: true,
      reportingAnalytics: true,
      customReports: false,
      apiAccess: false,
      webhooks: false,
      customIntegrations: false,
      smsNotifications: true,
      emailNotifications: true,
      broadcastMessaging: false,
      automations: true,
      customAutomations: false,
      supportLevel: 'basic',
      phoneSupport: false,
      emailSupport: true,
      chatSupport: false,
      multiLocation: false,
      maxLocations: 1,
      dataExport: true,
      bulkExport: false,
      customBranding: false,
      whiteLabel: false,
      sso: false,
      mfa: false,
      auditLogs: false,
      automatedBackups: true,
      backupRetentionDays: 30,
    },
    price: {
      monthly: 29,
      yearly: 290, // 2 months free
      currency: 'USD',
    },
  },
  
  professional: {
    maxPatients: 500,
    maxUsers: 15,
    maxDoctors: 10,
    maxAppointmentsPerMonth: 2000,
    maxAppointmentsPerDay: 100,
    maxVisitsPerMonth: 2000,
    maxStorageGB: 20,
    maxFileSizeMB: 25,
    features: {
      patientManagement: true,
      appointmentScheduling: true,
      visitManagement: true,
      prescriptionManagement: true,
      labResults: true,
      inventoryManagement: true,
      billingInvoicing: true,
      reportingAnalytics: true,
      customReports: true,
      apiAccess: true,
      webhooks: true,
      customIntegrations: false,
      smsNotifications: true,
      emailNotifications: true,
      broadcastMessaging: true,
      automations: true,
      customAutomations: true,
      supportLevel: 'priority',
      phoneSupport: true,
      emailSupport: true,
      chatSupport: true,
      multiLocation: true,
      maxLocations: 3,
      dataExport: true,
      bulkExport: true,
      customBranding: true,
      whiteLabel: false,
      sso: false,
      mfa: true,
      auditLogs: true,
      automatedBackups: true,
      backupRetentionDays: 90,
    },
    price: {
      monthly: 79,
      yearly: 790, // 2 months free
      currency: 'USD',
    },
  },
  
  enterprise: {
    maxPatients: null, // Unlimited
    maxUsers: null, // Unlimited
    maxDoctors: null, // Unlimited
    maxAppointmentsPerMonth: null, // Unlimited
    maxAppointmentsPerDay: null, // Unlimited
    maxVisitsPerMonth: null, // Unlimited
    maxStorageGB: null, // Unlimited
    maxFileSizeMB: 100,
    features: {
      patientManagement: true,
      appointmentScheduling: true,
      visitManagement: true,
      prescriptionManagement: true,
      labResults: true,
      inventoryManagement: true,
      billingInvoicing: true,
      reportingAnalytics: true,
      customReports: true,
      apiAccess: true,
      webhooks: true,
      customIntegrations: true,
      smsNotifications: true,
      emailNotifications: true,
      broadcastMessaging: true,
      automations: true,
      customAutomations: true,
      supportLevel: '24/7',
      phoneSupport: true,
      emailSupport: true,
      chatSupport: true,
      multiLocation: true,
      maxLocations: null, // Unlimited
      dataExport: true,
      bulkExport: true,
      customBranding: true,
      whiteLabel: true,
      sso: true,
      mfa: true,
      auditLogs: true,
      automatedBackups: true,
      backupRetentionDays: 365,
    },
    price: {
      monthly: 199,
      yearly: 1990, // 2 months free
      currency: 'USD',
    },
  },
};

/**
 * Get subscription package limitations
 */
export function getSubscriptionLimitations(plan: SubscriptionPlan | string | null | undefined): SubscriptionLimitations {
  if (!plan) {
    return SUBSCRIPTION_PACKAGES.trial; // Default to trial if no plan
  }
  
  const normalizedPlan = plan.toLowerCase() as SubscriptionPlan;
  return SUBSCRIPTION_PACKAGES[normalizedPlan] || SUBSCRIPTION_PACKAGES.trial;
}

/**
 * Check if a feature is available in the plan
 */
export function hasFeature(
  plan: SubscriptionPlan | string | null | undefined,
  feature: keyof SubscriptionLimitations['features']
): boolean {
  const limitations = getSubscriptionLimitations(plan);
  const featureValue = limitations.features[feature];
  return Boolean(featureValue);
}

/**
 * Check if a limit is exceeded
 */
export async function checkLimit(
  plan: SubscriptionPlan | string | null | undefined,
  limitType: 'patients' | 'users' | 'doctors' | 'appointmentsPerMonth' | 'appointmentsPerDay' | 'visitsPerMonth' | 'storageGB',
  currentCount: number
): Promise<{
  allowed: boolean;
  limit: number | null;
  current: number;
  remaining: number | null;
  exceeded: boolean;
}> {
  const limitations = getSubscriptionLimitations(plan);
  
  let limit: number | null = null;
  
  switch (limitType) {
    case 'patients':
      limit = limitations.maxPatients;
      break;
    case 'users':
      limit = limitations.maxUsers;
      break;
    case 'doctors':
      limit = limitations.maxDoctors;
      break;
    case 'appointmentsPerMonth':
      limit = limitations.maxAppointmentsPerMonth;
      break;
    case 'appointmentsPerDay':
      limit = limitations.maxAppointmentsPerDay;
      break;
    case 'visitsPerMonth':
      limit = limitations.maxVisitsPerMonth;
      break;
    case 'storageGB':
      limit = limitations.maxStorageGB;
      break;
  }
  
  const exceeded = limit !== null && currentCount >= limit;
  const remaining = limit !== null ? Math.max(0, limit - currentCount) : null;
  
  return {
    allowed: !exceeded,
    limit,
    current: currentCount,
    remaining,
    exceeded,
  };
}

/**
 * Get human-readable limit message
 */
export function getLimitMessage(
  plan: SubscriptionPlan | string | null | undefined,
  limitType: 'patients' | 'users' | 'doctors' | 'appointmentsPerMonth' | 'appointmentsPerDay' | 'visitsPerMonth' | 'storageGB'
): string {
  const limitations = getSubscriptionLimitations(plan);
  
  switch (limitType) {
    case 'patients':
      return limitations.maxPatients === null 
        ? 'Unlimited patients' 
        : `Up to ${limitations.maxPatients} patients`;
    case 'users':
      return limitations.maxUsers === null 
        ? 'Unlimited users' 
        : `Up to ${limitations.maxUsers} users`;
    case 'doctors':
      return limitations.maxDoctors === null 
        ? 'Unlimited doctors' 
        : `Up to ${limitations.maxDoctors} doctors`;
    case 'appointmentsPerMonth':
      return limitations.maxAppointmentsPerMonth === null 
        ? 'Unlimited appointments per month' 
        : `Up to ${limitations.maxAppointmentsPerMonth} appointments per month`;
    case 'appointmentsPerDay':
      return limitations.maxAppointmentsPerDay === null 
        ? 'Unlimited appointments per day' 
        : `Up to ${limitations.maxAppointmentsPerDay} appointments per day`;
    case 'visitsPerMonth':
      return limitations.maxVisitsPerMonth === null 
        ? 'Unlimited visits per month' 
        : `Up to ${limitations.maxVisitsPerMonth} visits per month`;
    case 'storageGB':
      return limitations.maxStorageGB === null 
        ? 'Unlimited storage' 
        : `Up to ${limitations.maxStorageGB} GB storage`;
    default:
      return 'Limit not defined';
  }
}

