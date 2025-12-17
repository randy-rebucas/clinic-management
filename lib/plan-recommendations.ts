/**
 * Plan Recommendation System
 * Suggests upgrades based on usage patterns
 */

import { getSubscriptionUsage } from '@/lib/subscription-limits';
import { getStorageUsageSummary } from '@/lib/storage-tracking';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { getSubscriptionLimitations, SUBSCRIPTION_PACKAGES } from '@/lib/subscription-packages';
import { Types } from 'mongoose';

export interface PlanRecommendation {
  recommendedPlan: 'basic' | 'professional' | 'enterprise';
  currentPlan: string;
  reason: string;
  benefits: string[];
  costSavings?: {
    monthly: number;
    yearly: number;
    percentage: number;
  };
  urgency: 'low' | 'medium' | 'high';
  metrics: {
    patients?: { current: number; recommended: number | null };
    users?: { current: number; recommended: number | null };
    storage?: { currentGB: number; recommended: number | null };
    appointments?: { current: number; recommended: number | null };
  };
}

/**
 * Get plan recommendations based on current usage
 */
export async function getPlanRecommendations(
  tenantId: string | Types.ObjectId
): Promise<PlanRecommendation[]> {
  try {
    const subscriptionStatus = await checkSubscriptionStatus(tenantId);
    const currentPlan = subscriptionStatus.plan || 'trial';
    const usage = await getSubscriptionUsage(tenantId);
    const storageSummary = await getStorageUsageSummary(tenantId);

    const recommendations: PlanRecommendation[] = [];
    const plans = ['trial', 'basic', 'professional', 'enterprise'];
    const currentPlanIndex = plans.indexOf(currentPlan);

    // Don't recommend if already on enterprise
    if (currentPlan === 'enterprise') {
      return [];
    }

    // Check each higher plan
    for (let i = currentPlanIndex + 1; i < plans.length; i++) {
      const recommendedPlan = plans[i] as 'basic' | 'professional' | 'enterprise';
      const recommendedLimits = getSubscriptionLimitations(recommendedPlan);
      const currentLimits = getSubscriptionLimitations(currentPlan);

      const reasons: string[] = [];
      const benefits: string[] = [];
      const metrics: PlanRecommendation['metrics'] = {};
      let urgency: 'low' | 'medium' | 'high' = 'low';

      // Check patients
      if (usage.patients.limit && usage.patients.current / usage.patients.limit >= 0.8) {
        if (recommendedLimits.maxPatients === null || recommendedLimits.maxPatients > usage.patients.current) {
          reasons.push(`Patient limit (${usage.patients.current}/${usage.patients.limit}) approaching`);
          metrics.patients = {
            current: usage.patients.current,
            recommended: recommendedLimits.maxPatients,
          };
          if (usage.patients.current / usage.patients.limit >= 0.9) urgency = 'high';
          else if (usage.patients.current / usage.patients.limit >= 0.8) urgency = 'medium';
        }
      }

      // Check users
      if (usage.users.limit && usage.users.current / usage.users.limit >= 0.8) {
        if (recommendedLimits.maxUsers === null || recommendedLimits.maxUsers > usage.users.current) {
          reasons.push(`User limit (${usage.users.current}/${usage.users.limit}) approaching`);
          metrics.users = {
            current: usage.users.current,
            recommended: recommendedLimits.maxUsers,
          };
          if (usage.users.current / usage.users.limit >= 0.9) urgency = 'high';
          else if (usage.users.current / usage.users.limit >= 0.8) urgency = 'medium';
        }
      }

      // Check storage
      if (usage.storage.limitGB && usage.storage.percentageUsed >= 80) {
        if (recommendedLimits.maxStorageGB === null || recommendedLimits.maxStorageGB > usage.storage.currentGB) {
          reasons.push(`Storage usage at ${usage.storage.percentageUsed.toFixed(0)}%`);
          metrics.storage = {
            currentGB: usage.storage.currentGB,
            recommended: recommendedLimits.maxStorageGB,
          };
          if (usage.storage.percentageUsed >= 90) urgency = 'high';
          else if (usage.storage.percentageUsed >= 80) urgency = 'medium';
        }
      }

      // Check appointments
      if (usage.appointmentsThisMonth.limit && 
          usage.appointmentsThisMonth.current / usage.appointmentsThisMonth.limit >= 0.8) {
        if (recommendedLimits.maxAppointmentsPerMonth === null || 
            recommendedLimits.maxAppointmentsPerMonth > usage.appointmentsThisMonth.current) {
          reasons.push(`Monthly appointment limit (${usage.appointmentsThisMonth.current}/${usage.appointmentsThisMonth.limit}) approaching`);
          metrics.appointments = {
            current: usage.appointmentsThisMonth.current,
            recommended: recommendedLimits.maxAppointmentsPerMonth,
          };
          if (usage.appointmentsThisMonth.current / usage.appointmentsThisMonth.limit >= 0.9) urgency = 'high';
          else if (usage.appointmentsThisMonth.current / usage.appointmentsThisMonth.limit >= 0.8) urgency = 'medium';
        }
      }

      // Only add recommendation if there are reasons
      if (reasons.length > 0) {
        // Build benefits list
        if (recommendedLimits.maxPatients !== null && recommendedLimits.maxPatients > (currentLimits.maxPatients || 0)) {
          benefits.push(`Up to ${recommendedLimits.maxPatients === null ? 'unlimited' : recommendedLimits.maxPatients} patients`);
        }
        if (recommendedLimits.maxUsers !== null && recommendedLimits.maxUsers > (currentLimits.maxUsers || 0)) {
          benefits.push(`Up to ${recommendedLimits.maxUsers === null ? 'unlimited' : recommendedLimits.maxUsers} users`);
        }
        if (recommendedLimits.maxStorageGB !== null && recommendedLimits.maxStorageGB > (currentLimits.maxStorageGB || 0)) {
          benefits.push(`Up to ${recommendedLimits.maxStorageGB === null ? 'unlimited' : recommendedLimits.maxStorageGB} GB storage`);
        }
        if (recommendedLimits.features.customReports && !currentLimits.features.customReports) {
          benefits.push('Custom reports');
        }
        if (recommendedLimits.features.apiAccess && !currentLimits.features.apiAccess) {
          benefits.push('API access');
        }
        if (recommendedLimits.features.webhooks && !currentLimits.features.webhooks) {
          benefits.push('Webhooks');
        }
        if (recommendedLimits.features.whiteLabel && !currentLimits.features.whiteLabel) {
          benefits.push('White-label solution');
        }

        // Calculate cost savings (yearly vs monthly)
        const currentPrice = currentLimits.price.monthly;
        const recommendedPrice = recommendedLimits.price.monthly;
        const recommendedYearly = recommendedLimits.price.yearly || recommendedPrice * 12;
        const monthlyCost = recommendedPrice * 12;
        const yearlyCost = recommendedYearly;
        const savings = monthlyCost - yearlyCost;
        const savingsPercentage = (savings / monthlyCost) * 100;

        const recommendation: PlanRecommendation = {
          recommendedPlan,
          currentPlan,
          reason: reasons.join(', '),
          benefits,
          urgency,
          metrics,
        };

        if (savings > 0) {
          recommendation.costSavings = {
            monthly: monthlyCost,
            yearly: yearlyCost,
            percentage: Math.round(savingsPercentage),
          };
        }

        recommendations.push(recommendation);
      }
    }

    // Sort by urgency (high first)
    recommendations.sort((a, b) => {
      const urgencyOrder = { high: 3, medium: 2, low: 1 };
      return urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
    });

    return recommendations;
  } catch (error: any) {
    console.error('Error getting plan recommendations:', error);
    return [];
  }
}

/**
 * Get the best recommended plan (highest urgency)
 */
export async function getBestPlanRecommendation(
  tenantId: string | Types.ObjectId
): Promise<PlanRecommendation | null> {
  const recommendations = await getPlanRecommendations(tenantId);
  return recommendations.length > 0 ? recommendations[0] : null;
}

