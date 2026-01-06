# Automation Quick Reference Guide

## 🎯 Quick Overview

**Current Status**: 27 automations implemented  
**Suggested Additions**: 15 new automations  
**Coverage**: Appointment scheduling, billing, inventory, patient engagement, reporting

---

## 📋 Existing Automations Checklist

### Appointment & Scheduling
- [x] Appointment reminders (24h before)
- [x] Recurring appointments
- [x] Follow-up scheduling
- [x] No-show handling
- [x] Waitlist management

### Financial
- [x] Invoice generation (on visit close)
- [x] Payment reminders

### Inventory
- [x] Low stock alerts
- [x] Expiry monitoring

### Clinical
- [x] Prescription refills
- [x] Medication reminders (4x daily)
- [x] Lab result notifications
- [x] Visit summaries

### Patient Engagement
- [x] Welcome messages
- [x] Birthday greetings
- [x] Health reminders
- [x] Feedback collection

### Reporting
- [x] Daily reports
- [x] Weekly reports
- [x] Monthly reports
- [x] Staff performance reports

### Operations
- [x] Insurance verification
- [x] Queue optimization
- [x] Broadcast messaging
- [x] Data retention
- [x] Trial expiration
- [x] Usage alerts

---

## 🚀 Top 5 Recommended New Automations

### 1. Smart Appointment Assignment ⭐⭐⭐
**Impact**: High | **Complexity**: Low | **Time**: 1-2 weeks
- Auto-assign doctors based on workload, specialization, availability
- **Benefit**: 30-40% reduction in manual scheduling work

### 2. Automatic Inventory Reordering ⭐⭐⭐
**Impact**: High | **Complexity**: Low | **Time**: 1-2 weeks
- Auto-create purchase orders when stock hits reorder point
- **Benefit**: 50% reduction in stockouts

### 3. Prescription Expiry Warnings ⭐⭐
**Impact**: Medium | **Complexity**: Low | **Time**: 3-5 days
- Alert patients before prescriptions expire
- **Benefit**: Prevents medication gaps, improves adherence

### 4. Document Expiration Tracking ⭐⭐
**Impact**: Medium | **Complexity**: Low | **Time**: 1 week
- Track and alert on expiring insurance cards, IDs
- **Benefit**: Prevents service denial, ensures compliance

### 5. Auto-Cancellation Policies ⭐⭐
**Impact**: Medium | **Complexity**: Low | **Time**: 3-5 days
- Progressive actions for chronic no-shows
- **Benefit**: 25% improvement in show rates

---

## 🔧 Quick Implementation Templates

### New Automation Structure
```typescript
// lib/automations/new-automation.ts
import connectDB from '@/lib/mongodb';
import { getSettings } from '@/lib/settings';
import { Types } from 'mongoose';

export interface NewAutomationOptions {
  tenantId?: string | Types.ObjectId;
  // ... other options
}

export async function processNewAutomation(
  tenantId?: string | Types.ObjectId
): Promise<{
  success: boolean;
  processed: number;
  errors: number;
}> {
  try {
    await connectDB();
    
    const settings = await getSettings();
    const enabled = settings.automationSettings?.autoNewAutomation !== false;
    
    if (!enabled) {
      return { success: true, processed: 0, errors: 0 };
    }
    
    // Implementation here
    
    return { success: true, processed: 0, errors: 0 };
  } catch (error: any) {
    console.error('Error in new automation:', error);
    return { success: false, processed: 0, errors: 1 };
  }
}
```

### Cron Endpoint Template
```typescript
// app/api/cron/new-automation/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { processNewAutomation } from '@/lib/automations/new-automation';
import { getTenantContext } from '@/lib/tenant';

export async function GET(request: NextRequest) {
  // Authentication check
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && !isVercelCron) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }
  
  try {
    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;
    
    const result = await processNewAutomation(tenantId);
    
    return NextResponse.json({
      success: result.success,
      message: 'Automation processed',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in automation cron:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process automation' },
      { status: 500 }
    );
  }
}
```

### Settings Configuration
```typescript
// Add to models/Settings.ts automationSettings:
autoNewAutomation: { type: Boolean, default: true },
```

### Vercel Cron Configuration
```json
// Add to vercel.json:
{
  "path": "/api/cron/new-automation",
  "schedule": "0 9 * * *"  // Daily at 9 AM
}
```

---

## 📊 Automation Schedule Overview

| Time | Automation | Frequency |
|------|-----------|-----------|
| 6:00 AM | Trial Expiration | Daily |
| 7:00 AM | Expiry Monitoring | Daily |
| 8:00 AM | Inventory Alerts | Daily |
| 8:00 AM | Birthday Greetings | Daily |
| 8:00 AM | Insurance Verification | Daily |
| 8:00 AM | Usage Alerts | Daily |
| 9:00 AM | Appointment Reminders | Daily |
| 9:00 AM | Prescription Refills | Daily |
| 9:00 AM | Weekly Reports | Monday |
| 9:00 AM | Weekly Staff Performance | Monday |
| 10:00 AM | Payment Reminders | Daily |
| 11:00 AM | Follow-up Scheduling | Daily |
| 12:00 PM | Health Reminders | Daily |
| 1:00 PM | Recurring Appointments | Daily |
| 6:00 PM | Feedback Collection | Daily |
| 11:00 PM | Daily Reports | Daily |
| 12:00 AM | Medication Reminders | 4x Daily |
| Every 15 min | Waitlist Management | Continuous |
| Every 30 min | No-Show Handling | Continuous |

---

## ✅ Known Issues & TODOs

### Invoice Generation
- **TODO**: Populate procedures and get their service codes/prices
- **Location**: `lib/automations/invoice-generation.ts:137`
- **Priority**: Medium

### Insurance Verification
- **TODO**: Integrate with actual insurance verification API
- **Location**: `lib/automations/insurance-verification.ts:63`
- **Priority**: High (currently simulated)

### Recurring Appointments
- **Note**: Uses notes field to track recurring - consider dedicated field
- **Location**: `lib/automations/recurring-appointments.ts:279`
- **Priority**: Low

---

## 🎛️ Configuration Points

### Enable/Disable Automations
All automations can be toggled in Settings:
```typescript
automationSettings: {
  autoInvoiceGeneration: true,
  autoPaymentReminders: true,
  autoLowStockAlerts: true,
  // ... etc
}
```

### Notification Preferences
- Email: Controlled per automation
- SMS: Controlled per automation
- In-app: Always enabled (for logged-in users)

---

## 📈 Monitoring & Metrics

### Key Metrics to Track
1. **Automation Success Rate**: % of successful executions
2. **Processing Time**: Average execution duration
3. **Impact Metrics**: 
   - Appointment show rate
   - Payment collection rate
   - Inventory stockout frequency
   - Patient engagement rates

### Error Handling
- All automations log errors
- Failures don't block critical operations
- Errors sent to monitoring (Sentry if configured)

---

## 🔗 Related Files

- **Automations**: `lib/automations/*.ts`
- **Cron Jobs**: `app/api/cron/*/route.ts`
- **Settings**: `models/Settings.ts`
- **Schedule**: `vercel.json`
- **Full Analysis**: `AUTOMATION_ANALYSIS_AND_SUGGESTIONS.md`

---

**Last Updated**: 2024
