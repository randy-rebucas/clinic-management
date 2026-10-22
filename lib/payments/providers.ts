/** Payment providers a clinic or doctor can use (models/PaymentAccount.ts). Client-safe. */
export const PAYMENT_PROVIDERS = ['paymongo', 'xendit', 'maya', 'manual_qr', 'bank_transfer'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
export const ONLINE_PROVIDERS = ['paymongo', 'xendit', 'maya'] as const satisfies readonly PaymentProvider[];
export type OnlineProvider = (typeof ONLINE_PROVIDERS)[number];

export const isOnlineProvider = (p: string): p is OnlineProvider => (ONLINE_PROVIDERS as readonly string[]).includes(p);
