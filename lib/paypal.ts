/**
 * PayPal integration utilities for subscription payments
 * Uses PayPal REST API v2
 */

// PayPal API base URLs
const PAYPAL_API_BASE = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

// Cache for access token
let accessToken: { token: string; expiresAt: number } | null = null;

/**
 * Get PayPal access token
 */
async function getPayPalAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (accessToken && accessToken.expiresAt > Date.now()) {
    return accessToken.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
  const baseUrl = PAYPAL_API_BASE[environment as keyof typeof PAYPAL_API_BASE] || PAYPAL_API_BASE.sandbox;

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables.');
  }

  try {
    // Create basic auth header
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en_US',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authHeader}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
      }),
    });

    if (!authResponse.ok) {
      const error = await authResponse.text();
      throw new Error(`PayPal auth failed: ${error}`);
    }

    const data = await authResponse.json();
    
    // Cache token (expires in ~8 hours, cache for 7 hours)
    accessToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 3600) * 1000,
    };

    return data.access_token;
  } catch (error: any) {
    console.error('Error getting PayPal access token:', error);
    throw new Error('Failed to authenticate with PayPal');
  }
}

/** Whether this server holds PayPal credentials, i.e. whether a plan can be paid for online. */
export function isPayPalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

/**
 * Create a PayPal order for subscription payment
 */
export async function createPayPalOrder(
  planName: string,
  amount: number,
  currency: string = 'USD',
  tenantId: string,
  appUrl?: string,
  billingCycle: 'monthly' | 'yearly' = 'monthly'
): Promise<{ orderId: string; approvalUrl: string }> {
  try {
    const accessToken = await getPayPalAccessToken();
    const environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
    const baseUrl = PAYPAL_API_BASE[environment as keyof typeof PAYPAL_API_BASE] || PAYPAL_API_BASE.sandbox;
    // Use provided appUrl (from request origin) or fall back to env var
    const resolvedAppUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const cycleLabel = billingCycle === 'yearly' ? 'Annual' : 'Monthly';

    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: `subscription-${tenantId}-${Date.now()}`,
            description: `MyClinicSoft ${planName} Plan (${cycleLabel})`,
            amount: {
              currency_code: currency,
              value: amount.toFixed(2),
            },
          },
        ],
        application_context: {
          brand_name: 'MyClinicSoft',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          // PayPal adds ?token=<order id>&PayerID=… to both. The return page captures the order;
          // plan and cycle are read from the stored order, never from these URLs.
          return_url: `${resolvedAppUrl}/admin/subscription/success`,
          cancel_url: `${resolvedAppUrl}/admin/subscription?canceled=1`,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PayPal API error: ${response.status} - ${error}`);
    }

    const order = await response.json();
    const approvalUrl = order.links?.find((link: any) => link.rel === 'approve')?.href;

    if (!approvalUrl || !order.id) {
      throw new Error('Failed to get PayPal approval URL');
    }

    return {
      orderId: order.id,
      approvalUrl,
    };
  } catch (error: any) {
    console.error('Error creating PayPal order:', error);
    throw new Error('Failed to create PayPal order');
  }
}

export interface PayPalCaptureResult {
  success: boolean;
  transactionId?: string;
  amount?: number;
  currency?: string;
  payerEmail?: string;
  /** PayPal order status (e.g. COMPLETED, APPROVED) when known. */
  orderStatus?: string;
  /** PayPal reported the order was captured already (e.g. a retried request). */
  alreadyCaptured?: boolean;
  /** Network/5xx failure: the outcome is unknown and the caller should check the order. */
  transient?: boolean;
  error?: string;
}

const PAYPAL_ORDER_ID = /^[A-Z0-9-]{5,64}$/i;

export function isValidPayPalOrderId(orderId: unknown): orderId is string {
  return typeof orderId === 'string' && PAYPAL_ORDER_ID.test(orderId);
}

function parseOrder(order: any): PayPalCaptureResult {
  const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) {
    return { success: false, orderStatus: order?.status, error: 'No capture found in PayPal response' };
  }
  return {
    success: capture.status === 'COMPLETED',
    orderStatus: order?.status,
    transactionId: capture.id,
    amount: parseFloat(capture.amount?.value || '0'),
    currency: capture.amount?.currency_code || 'USD',
    payerEmail: order?.payer?.email_address,
    error: capture.status === 'COMPLETED' ? undefined : `Capture status ${capture.status}`,
  };
}

/**
 * Capture a PayPal order after user approval
 */
export async function capturePayPalOrder(orderId: string): Promise<PayPalCaptureResult> {
  if (!isValidPayPalOrderId(orderId)) {
    return { success: false, error: 'Invalid order id' };
  }
  try {
    const accessToken = await getPayPalAccessToken();
    const environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
    const baseUrl = PAYPAL_API_BASE[environment as keyof typeof PAYPAL_API_BASE] || PAYPAL_API_BASE.sandbox;

    const response = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=representation',
        // Makes a retried capture of the same order idempotent on PayPal's side.
        'PayPal-Request-Id': `capture-${orderId}`,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`PayPal capture failed for ${orderId}: ${response.status} ${text}`);
      return {
        success: false,
        alreadyCaptured: response.status === 422 && text.includes('ORDER_ALREADY_CAPTURED'),
        transient: response.status >= 500 || response.status === 429,
        error: 'PayPal capture failed',
      };
    }

    return parseOrder(await response.json());
  } catch (error: any) {
    console.error('Error capturing PayPal order:', error);
    return { success: false, transient: true, error: 'Failed to capture PayPal order' };
  }
}

/**
 * Fetch an order from PayPal. Used to resolve the real outcome after a capture
 * timed out or was reported as already captured.
 */
export async function getPayPalOrder(orderId: string): Promise<PayPalCaptureResult> {
  if (!isValidPayPalOrderId(orderId)) {
    return { success: false, error: 'Invalid order id' };
  }
  try {
    const accessToken = await getPayPalAccessToken();
    const environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
    const baseUrl = PAYPAL_API_BASE[environment as keyof typeof PAYPAL_API_BASE] || PAYPAL_API_BASE.sandbox;

    const response = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error(`PayPal get order failed for ${orderId}: ${response.status} ${await response.text()}`);
      return { success: false, transient: response.status >= 500, error: 'Failed to fetch PayPal order' };
    }
    const order = await response.json();
    const result = parseOrder(order);
    return { ...result, success: result.success && order?.status === 'COMPLETED' };
  } catch (error: any) {
    console.error('Error fetching PayPal order:', error);
    return { success: false, transient: true, error: 'Failed to fetch PayPal order' };
  }
}

/**
 * Verify PayPal webhook signature using PayPal's verify-webhook-signature API
 */
export async function verifyPayPalWebhook(
  headers: Record<string, string | null>,
  body: string,
  webhookId: string
): Promise<boolean> {
  const authAlgo = headers['paypal-auth-algo'];
  const certUrl = headers['paypal-cert-url'];
  const transmissionId = headers['paypal-transmission-id'];
  const transmissionSig = headers['paypal-transmission-sig'];
  const transmissionTime = headers['paypal-transmission-time'];

  // All required headers must be present
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return false;
  }

  try {
    const token = await getPayPalAccessToken();
    const environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
    const baseUrl = PAYPAL_API_BASE[environment as keyof typeof PAYPAL_API_BASE] || PAYPAL_API_BASE.sandbox;

    const verifyResponse = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      }),
    });

    if (!verifyResponse.ok) {
      console.error('PayPal webhook verification API error:', await verifyResponse.text());
      return false;
    }

    const result = await verifyResponse.json();
    return result.verification_status === 'SUCCESS';
  } catch (error: any) {
    console.error('Error verifying PayPal webhook:', error);
    return false;
  }
}
