import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to detect user's country based on IP address
 * This avoids CORS issues when calling geolocation APIs from the client
 */
export async function GET(request: NextRequest) {
  try {
    // Get client IP from request headers
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const clientIp = forwarded?.split(',')[0]?.trim() || realIp?.trim() || '';

    // Try ipapi.co first (free tier: 1000 requests/day)
    try {
      const ipapiUrl = clientIp && clientIp !== '::1' && !clientIp.startsWith('127.')
        ? `https://ipapi.co/${clientIp}/json/`
        : 'https://ipapi.co/json/';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(ipapiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.country_code && !data.error) {
          return NextResponse.json({
            success: true,
            countryCode: data.country_code,
            country: data.country_name,
            timezone: data.timezone,
            currency: data.currency,
          });
        }
      }
    } catch (error: any) {
      // Only log if it's not a timeout or abort
      if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
        console.warn('ipapi.co failed:', error.message);
      }
    }

    // Fallback to ip-api.com (free tier: 45 requests/minute)
    try {
      const ipApiUrl = clientIp && clientIp !== '::1' && !clientIp.startsWith('127.')
        ? `http://ip-api.com/json/${clientIp}`
        : 'http://ip-api.com/json/';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(ipApiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.countryCode) {
          return NextResponse.json({
            success: true,
            countryCode: data.countryCode,
            country: data.country,
            timezone: data.timezone,
            currency: data.currency || null,
          });
        }
      }
    } catch (error: any) {
      // Only log if it's not a timeout or abort
      if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
        console.warn('ip-api.com failed:', error.message);
      }
    }

    // If both APIs fail, return a graceful response (not 500)
    // The client will handle this and use fallback detection
    return NextResponse.json({
      success: false,
      error: 'Unable to detect location via IP. Using browser fallback.',
    });
  } catch (error: any) {
    console.error('Geolocation detection error:', error);
    // Return a graceful error response instead of 500
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
