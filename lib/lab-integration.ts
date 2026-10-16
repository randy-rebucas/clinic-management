// Third-Party Lab Integration Utilities
// Supports integration with external laboratory systems
import 'server-only';
import { lookup as dnsLookup } from 'dns/promises';
import type { LookupAddress } from 'dns';
import https from 'https';
import net from 'net';

export interface LabIntegrationConfig {
  labName: string;
  labId?: string;
  labCode?: string;
  integrationType: 'manual' | 'api' | 'hl7' | 'other';
  apiEndpoint?: string;
  apiKey?: string;
  apiSecret?: string;
  credentials?: Record<string, any>;
}

export interface LabRequestPayload {
  requestCode: string;
  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender?: string;
    patientCode?: string;
  };
  testType: string;
  testCode?: string;
  urgency: 'routine' | 'urgent' | 'stat';
  clinicalInfo?: {
    diagnosis?: string;
    chiefComplaint?: string;
  };
  specialInstructions?: string;
}

export interface LabResultPayload {
  externalRequestId: string;
  externalResultId: string;
  testType: string;
  results: any;
  resultDate: string;
  referenceRanges?: any;
  abnormalFlags?: Record<string, 'high' | 'low' | 'normal'>;
  interpretation?: string;
}

// ─── Outbound URL safety (SSRF) ─────────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inRange(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4 = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
  '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
];

/** Expand an IPv6 address (any notation, optional zone id) to its 8 hextets, or null. */
function ipv6Hextets(ip: string): number[] | null {
  let v = ip.split('%')[0].toLowerCase();
  const tail = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    if (!net.isIPv4(tail[1])) return null;
    const n = ipv4ToInt(tail[1]);
    v = v.slice(0, -tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = v.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array(Math.max(missing, 0)).fill('0'), ...rest];
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

/**
 * True for loopback, private, link-local, CGNAT, multicast, reserved and metadata addresses
 * (169.254.169.254, fd00:ec2::254), including IPv4 embedded in IPv6 (mapped/compatible/NAT64/6to4).
 * Anything that doesn't parse as an IP is treated as private.
 */
export function isPrivateAddress(ip: string): boolean {
  if (typeof ip !== 'string') return true;
  if (net.isIPv4(ip)) return BLOCKED_V4.some((cidr) => inRange(ip, cidr));
  if (!net.isIPv6(ip.split('%')[0])) return true;
  const h = ipv6Hextets(ip);
  if (!h) return true;
  const embeddedV4 = (hi: number, lo: number) => `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;
  const zeroPrefix = (n: number) => h.slice(0, n).every((g) => g === 0);
  // ::ffff:a.b.c.d (mapped) and ::ffff:0:a.b.c.d (translated) take the IPv4 verdict.
  if (zeroPrefix(5) && h[5] === 0xffff) return isPrivateAddress(embeddedV4(h[6], h[7]));
  if (zeroPrefix(4) && h[4] === 0xffff && h[5] === 0) return isPrivateAddress(embeddedV4(h[6], h[7]));
  if (zeroPrefix(6)) return true; // ::, ::1 and deprecated IPv4-compatible addresses
  const first = h[0];
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local (includes fd00:ec2::254)
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xffc0) === 0xfec0 || // fec0::/10 deprecated site-local
    (first & 0xff00) === 0xff00 || // ff00::/8 multicast
    (first === 0x0064 && h[1] === 0xff9b) || // 64:ff9b::/96 and 64:ff9b:1::/48 NAT64
    (first === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) || // 100::/64 discard
    first === 0x2002 || // 6to4 can embed a private IPv4
    (first === 0x2001 && h[1] < 0x0200) || // 2001::/23 special-purpose: Teredo, benchmarking, ORCHID
    (first === 0x2001 && h[1] === 0x0db8) // documentation
  );
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type Resolver = (hostname: string, options: { all: true; verbatim: true; family?: number }) => Promise<LookupAddress[]>;

/**
 * A `lookup` for http(s).request that validates the addresses the socket will actually
 * connect to. Checking DNS up front and then letting fetch() resolve again would allow a
 * rebinding server to answer with a private address the second time.
 */
export function createPinnedLookup(resolve: Resolver = (h, o) => dnsLookup(h, o)) {
  return (hostname: string, options: any, callback: LookupCallback): void => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    const opts = typeof options === 'object' && options ? options : {};
    const family = opts.family === 4 || opts.family === 6 ? opts.family : undefined;
    resolve(hostname, { all: true, verbatim: true, ...(family ? { family } : {}) })
      .then((addresses) => {
        if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
          const err: NodeJS.ErrnoException = new Error(`Refusing to connect to a non-public address for ${hostname}`);
          err.code = 'EBLOCKEDADDRESS';
          callback(err, opts.all ? [] : '', undefined);
          return;
        }
        if (opts.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      })
      .catch((err) => callback(err, opts.all ? [] : '', undefined));
  };
}

const MAX_LAB_RESPONSE_BYTES = 1024 * 1024;
const LAB_REQUEST_TIMEOUT_MS = 15000;

/** POST JSON over https with connect-time address pinning, no redirects, a timeout and a size cap. */
function pinnedPostJson(
  endpoint: string,
  headers: Record<string, string>,
  body: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      endpoint,
      {
        method: 'POST',
        lookup: createPinnedLookup() as any,
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
        timeout: LAB_REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_LAB_RESPONSE_BYTES) {
            req.destroy(new Error('Lab API response too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      }
    );
    // `timeout` only covers socket idleness; this caps the whole exchange.
    const deadline = setTimeout(() => req.destroy(new Error('Lab API request timed out')), LAB_REQUEST_TIMEOUT_MS);
    req.on('timeout', () => req.destroy(new Error('Lab API request timed out')));
    req.on('error', reject);
    req.on('close', () => clearTimeout(deadline));
    req.end(body);
  });
}

/**
 * Validate an outbound integration URL: https only, no embedded credentials, default port,
 * and every address the host resolves to must be public. Returns an error message or null.
 */
export async function checkOutboundUrl(raw: string | undefined | null): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(String(raw || ''));
  } catch {
    return 'Invalid lab API endpoint';
  }
  if (url.protocol !== 'https:') return 'Lab API endpoint must use https';
  if (url.username || url.password) return 'Lab API endpoint must not contain credentials';
  if (url.port && url.port !== '443') return 'Lab API endpoint must use the default https port';

  const allowedHosts = (process.env.LAB_API_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (allowedHosts.length && !allowedHosts.includes(host)) return 'Lab API host is not allowed';

  try {
    const addresses = net.isIP(host) ? [{ address: host }] : await dnsLookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
      return 'Lab API endpoint must be a public address';
    }
  } catch {
    return 'Lab API host could not be resolved';
  }
  return null;
}

/**
 * Server-side lab configuration. LAB_INTEGRATIONS is a JSON array of
 * { labCode, labName, apiEndpoint, apiKey, apiSecret?, tenantIds? }; an entry with
 * tenantIds is only usable by those clinics.
 */
export function getConfiguredLab(labCode: string | undefined, tenantId: string): LabIntegrationConfig | null {
  if (!labCode || !process.env.LAB_INTEGRATIONS) return null;
  try {
    const entries = JSON.parse(process.env.LAB_INTEGRATIONS);
    if (!Array.isArray(entries)) return null;
    const entry = entries.find((e: any) => e && e.labCode === labCode);
    if (!entry) return null;
    if (Array.isArray(entry.tenantIds) && !entry.tenantIds.map(String).includes(String(tenantId))) return null;
    return {
      labName: String(entry.labName || labCode),
      labCode: String(labCode),
      labId: entry.labId ? String(entry.labId) : undefined,
      integrationType: 'api',
      apiEndpoint: String(entry.apiEndpoint || ''),
      apiKey: entry.apiKey ? String(entry.apiKey) : undefined,
      apiSecret: entry.apiSecret ? String(entry.apiSecret) : undefined,
    };
  } catch {
    console.error('LAB_INTEGRATIONS is not valid JSON');
    return null;
  }
}

// Send lab request to third-party lab via API
export async function sendLabRequestToThirdParty(
  config: LabIntegrationConfig,
  request: LabRequestPayload
): Promise<{ success: boolean; externalRequestId?: string; error?: string }> {
  if (config.integrationType !== 'api') {
    return {
      success: false,
      error: 'API integration not configured for this lab',
    };
  }

  if (!config.apiEndpoint || !config.apiKey) {
    return {
      success: false,
      error: 'Lab API credentials not configured',
    };
  }

  const urlError = await checkOutboundUrl(config.apiEndpoint);
  if (urlError) {
    return { success: false, error: urlError };
  }

  try {
    const response = await pinnedPostJson(
      config.apiEndpoint,
      {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        ...(config.apiSecret ? { 'X-API-Secret': config.apiSecret } : {}),
      },
      JSON.stringify({
        request: {
          requestCode: request.requestCode,
          patient: request.patient,
          test: {
            type: request.testType,
            code: request.testCode,
            urgency: request.urgency,
          },
          clinicalInfo: request.clinicalInfo,
          instructions: request.specialInstructions,
        },
      })
    );

    // 3xx counts as failure: a redirect target was never validated.
    if (response.status < 200 || response.status >= 300) {
      return {
        success: false,
        error: `Lab API error (HTTP ${response.status})`,
      };
    }

    const data = JSON.parse(response.body || '{}') || {};
    return {
      success: true,
      externalRequestId: data.requestId || data.id,
    };
  } catch (error: any) {
    console.error('Error sending lab request to third party:', error);
    return {
      success: false,
      error: 'Failed to send request to lab',
    };
  }
}

// Receive lab results from third-party lab
export async function receiveLabResultFromThirdParty(
  config: LabIntegrationConfig,
  result: LabResultPayload
): Promise<{ success: boolean; error?: string }> {
  if (config.integrationType !== 'api') {
    return {
      success: false,
      error: 'API integration not configured for this lab',
    };
  }

  // This would typically be called by a webhook from the lab
  // For now, we'll just validate the payload
  if (!result.externalRequestId || !result.externalResultId) {
    return {
      success: false,
      error: 'Missing required fields in lab result',
    };
  }

  return {
    success: true,
  };
}

// HL7 Integration (placeholder for HL7 message processing)
export function processHL7Message(hl7Message: string): LabRequestPayload | null {
  // This would parse HL7 messages
  // For now, return null as placeholder
  return null;
}

// Webhook handler for receiving lab results
export async function handleLabResultWebhook(
  config: LabIntegrationConfig,
  webhookPayload: any
): Promise<LabResultPayload | null> {
  // Process webhook payload based on lab's format
  // This is a placeholder - implement based on actual lab webhook format
  
  if (!webhookPayload.requestId || !webhookPayload.results) {
    return null;
  }

  return {
    externalRequestId: webhookPayload.requestId,
    externalResultId: webhookPayload.resultId || webhookPayload.id,
    testType: webhookPayload.testType || webhookPayload.test?.type,
    results: webhookPayload.results,
    resultDate: webhookPayload.resultDate || new Date().toISOString(),
    referenceRanges: webhookPayload.referenceRanges,
    abnormalFlags: webhookPayload.abnormalFlags,
    interpretation: webhookPayload.interpretation,
  };
}

