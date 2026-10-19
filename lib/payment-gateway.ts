import 'server-only';
import { isPayMongoConfigured } from '@/lib/paymongo';
import { isPayPalConfigured } from '@/lib/paypal';

export type Gateway = 'paymongo' | 'paypal';

/**
 * Which gateway subscriptions are paid through: PayMongo (pesos, GCash and cards) when this
 * server has it, else PayPal, else none.
 */
export function subscriptionGateway(): Gateway | null {
  if (isPayMongoConfigured()) return 'paymongo';
  if (isPayPalConfigured()) return 'paypal';
  return null;
}

export const GATEWAY_NAME: Record<Gateway, string> = { paymongo: 'PayMongo', paypal: 'PayPal' };

/** The currency a gateway charges plans in (planPrice's third argument). */
export const gatewayCurrency = (g: Gateway | null): 'PHP' | undefined => (g === 'paymongo' ? 'PHP' : undefined);
