import { NextRequest, NextResponse } from 'next/server';
import { isIP } from 'net';

function isPublicIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false; // multicast / reserved
    return true;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return false;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('ff')) {
      return false;
    }
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]);
    return true;
  }
  return false;
}

function clientIpFrom(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  for (const candidate of [forwarded, realIp]) {
    if (candidate && isIP(candidate) && isPublicIp(candidate)) return candidate;
  }
  return null;
}

const unavailable = () =>
  NextResponse.json({
    success: false,
    error: 'Unable to detect location via IP. Using browser fallback.',
  });

/**
 * API route to detect user's country based on IP address
 * This avoids CORS issues when calling geolocation APIs from the client
 */
export async function GET(request: NextRequest) {
  try {
    // Without a public client IP, a lookup would only describe the server's own address.
    const clientIp = clientIpFrom(request);
    if (!clientIp) return unavailable();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`https://ipapi.co/${encodeURIComponent(clientIp)}/json/`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
        redirect: 'error',
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (typeof data?.country_code === 'string' && /^[A-Z]{2}$/.test(data.country_code) && !data.error) {
          return NextResponse.json({
            success: true,
            countryCode: data.country_code,
            country: typeof data.country_name === 'string' ? data.country_name : undefined,
            timezone: typeof data.timezone === 'string' ? data.timezone : undefined,
            currency: typeof data.currency === 'string' ? data.currency : undefined,
          });
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
        console.warn('ipapi.co failed:', error.message);
      }
    }

    // The client handles this and falls back to browser-based detection.
    return unavailable();
  } catch (error: any) {
    console.error('Geolocation detection error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
    });
  }
}
