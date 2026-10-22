import { describe, it, expect } from 'vitest';
import SubscriptionOrder from '@/models/SubscriptionOrder';
import { currentOrderId } from '@/lib/subscription-order';

describe('SubscriptionOrder', () => {
  it('keeps the old collection, so orders from before PayPal was removed stay readable', () => {
    expect(SubscriptionOrder.collection.collectionName).toBe('paypalorders');
    expect(new SubscriptionOrder({}).get('currency')).toBe('PHP');
    expect(new SubscriptionOrder({}).get('provider')).toBe('paymongo');
  });
});

describe('currentOrderId', () => {
  it('reads lastOrderId, falling back to the older paypalOrderId', () => {
    expect(currentOrderId({ lastOrderId: 'pm_new', paypalOrderId: 'pm_old' })).toBe('pm_new');
    expect(currentOrderId({ paypalOrderId: 'pm_old' })).toBe('pm_old');
    expect(currentOrderId(undefined)).toBeUndefined();
  });
});
