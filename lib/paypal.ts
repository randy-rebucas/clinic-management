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
          return_url: `${resolvedAppUrl}/subscription/success?plan=${planName}&cycle=${billingCycle}`,
          cancel_url: `${resolvedAppUrl}/subscription?canceled=true`,
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
    throw new Error(error.message || 'Failed to create PayPal order');
  }
}

/**
 * Capture a PayPal order after user approval
 */
export async function capturePayPalOrder(orderId: string): Promise<{
  success: boolean;
  transactionId?: string;
  amount?: number;
  currency?: string;
  payerEmail?: string;
  error?: string;
}> {
  try {
    const accessToken = await getPayPalAccessToken();
    const environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
    const baseUrl = PAYPAL_API_BASE[environment as keyof typeof PAYPAL_API_BASE] || PAYPAL_API_BASE.sandbox;

    const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `PayPal capture failed: ${response.status} - ${error}`,
      };
    }

    const order = await response.json();
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    const payer = order.payer;

    if (!capture) {
      return {
        success: false,
        error: 'No capture found in PayPal response',
      };
    }

    return {
      success: capture.status === 'COMPLETED',
      transactionId: capture.id,
      amount: parseFloat(capture.amount?.value || '0'),
      currency: capture.amount?.currency_code || 'USD',
      payerEmail: payer?.email_address,
    };
  } catch (error: any) {
    console.error('Error capturing PayPal order:', error);
    return {
      success: false,
      error: error.message || 'Failed to capture PayPal order',
    };
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
