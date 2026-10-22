import type { OnlineProvider } from '@/lib/payments/providers';

/**
 * One online payment provider, used with a clinic's or doctor's own keys (models/PaymentAccount).
 * Every call gets the account's decrypted credentials; nothing here reads the platform's keys.
 */

export interface GatewayCredentials {
  secretKey: string;
  /** Webhook signing secret (PayMongo whsk_…) or callback token (Xendit). */
  webhookSecret?: string;
  /** Maya: the public key checkouts are created with. */
  publicKey?: string;
  /** Which of the provider's environments the keys belong to (Maya's keys don't say). */
  mode?: 'live' | 'test';
}

export interface CheckoutRequest {
  amount: number;
  name: string;
  description: string;
  reference: string;
  successUrl: string;
  cancelUrl: string;
  email?: string;
  /** Comes back on the provider's notice; must say what is paid (tenantId, invoiceId, accountId). */
  metadata: Record<string, string>;
}

export interface CheckoutState {
  id: string;
  /** Total paid on it, in pesos. */
  paid: number;
  paymentId?: string;
  method?: string;
  /**
   * What we attached at creation, read back from the provider; null when the provider keeps no
   * such data (Maya), and the checkout is then matched by the invoice's own pay-link record only.
   */
  metadata: Record<string, string> | null;
}

export type GatewayEvent =
  | { kind: 'paid'; checkoutId: string; checkout?: CheckoutState }
  | { kind: 'refunded'; paymentId: string; refundedAmount: number | 'full' }
  | { kind: 'ignore' };

export interface GatewayAdapter {
  provider: OnlineProvider;
  label: string;
  /** Secret key pattern, for the settings form. */
  keyHint: string;
  /** Whether this provider can be connected yet. */
  available: boolean;
  createCheckout(creds: GatewayCredentials, req: CheckoutRequest): Promise<{ id: string; url: string }>;
  retrieveCheckout(creds: GatewayCredentials, id: string): Promise<CheckoutState>;
  /**
   * Check the notice really came from the provider for this account, then read it. Null when
   * it did not (bad or missing signature). Nothing in the body is trusted before this passes.
   */
  verifyEvent(creds: GatewayCredentials, rawBody: string, headers: Headers): GatewayEvent | null;
  testConnection(creds: GatewayCredentials): Promise<{ ok: true; mode: 'live' | 'test' } | { ok: false; error: string }>;
}
