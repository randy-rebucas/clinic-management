// Discount Calculator Utility
// Calculates discounts based on patient eligibility (PWD, Senior, Membership)

export interface DiscountEligibility {
  pwd?: {
    eligible: boolean;
    idNumber?: string;
    expiryDate?: Date;
  };
  senior?: {
    eligible: boolean;
    idNumber?: string;
  };
  membership?: {
    eligible: boolean;
    membershipType?: string;
    membershipNumber?: string;
    expiryDate?: Date;
    discountPercentage?: number;
  };
}

export interface DiscountResult {
  type: 'pwd' | 'senior' | 'membership' | 'promotional' | 'other';
  reason: string;
  percentage?: number;
  amount: number;
}

// Standard discount percentages (can be configured)
const DISCOUNT_PERCENTAGES = {
  pwd: 20, // 20% discount for PWD
  senior: 20, // 20% discount for Senior Citizens
  membership: 0, // Variable based on membership type
};

// Check if patient is a senior citizen (60+ years old)
export function isSeniorCitizen(dateOfBirth: Date): boolean {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    return age - 1 >= 60;
  }
  
  return age >= 60;
}

// Calculate applicable discounts for a patient
export function calculateDiscounts(
  subtotal: number,
  eligibility: DiscountEligibility | undefined,
  dateOfBirth?: Date
): DiscountResult[] {
  const discounts: DiscountResult[] = [];

  if (!eligibility) {
    return discounts;
  }

  // PWD Discount
  if (eligibility.pwd?.eligible) {
    const pwdDiscount = subtotal * (DISCOUNT_PERCENTAGES.pwd / 100);
    discounts.push({
      type: 'pwd',
      reason: 'PWD Discount',
      percentage: DISCOUNT_PERCENTAGES.pwd,
      amount: pwdDiscount,
    });
  }

  // Senior Citizen Discount
  if (eligibility.senior?.eligible || (dateOfBirth && isSeniorCitizen(dateOfBirth))) {
    const seniorDiscount = subtotal * (DISCOUNT_PERCENTAGES.senior / 100);
    discounts.push({
      type: 'senior',
      reason: 'Senior Citizen Discount',
      percentage: DISCOUNT_PERCENTAGES.senior,
      amount: seniorDiscount,
    });
  }

  // Membership Discount
  if (eligibility.membership?.eligible) {
    const membershipPercentage = eligibility.membership.discountPercentage || 10; // Default 10%
    const membershipDiscount = subtotal * (membershipPercentage / 100);
    discounts.push({
      type: 'membership',
      reason: `Membership Discount (${eligibility.membership.membershipType || 'Member'})`,
      percentage: membershipPercentage,
      amount: membershipDiscount,
    });
  }

  // Note: Only one discount type typically applies (usually the highest)
  // Return the highest discount, or combine them based on your business rules
  // For now, we'll return all applicable discounts and let the UI/business logic decide
  return discounts;
}

// Get the best discount (highest amount)
export function getBestDiscount(discounts: DiscountResult[]): DiscountResult | null {
  if (discounts.length === 0) {
    return null;
  }

  return discounts.reduce((best, current) => 
    current.amount > best.amount ? current : best
  );
}

// Apply discounts to subtotal
export function applyDiscounts(subtotal: number, discounts: DiscountResult[]): number {
  const totalDiscount = discounts.reduce((sum, disc) => sum + disc.amount, 0);
  return Math.max(0, subtotal - totalDiscount);
}

