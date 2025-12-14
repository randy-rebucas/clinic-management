/**
 * Country detection and default settings mapping
 * Provides country-based defaults for timezone, currency, and date format
 */

export interface CountryDefaults {
  country: string;
  countryCode: string;
  timezone: string;
  currency: string;
  dateFormat: string;
}

/**
 * Mapping of country codes to their default settings
 */
const COUNTRY_DEFAULTS: Record<string, Omit<CountryDefaults, 'country'>> = {
  // Philippines
  PH: {
    countryCode: 'PH',
    timezone: 'Asia/Manila',
    currency: 'PHP',
    dateFormat: 'MM/DD/YYYY',
  },
  // United States
  US: {
    countryCode: 'US',
    timezone: 'America/New_York',
    currency: 'USD',
    dateFormat: 'MM/DD/YYYY',
  },
  // United Kingdom
  GB: {
    countryCode: 'GB',
    timezone: 'Europe/London',
    currency: 'GBP',
    dateFormat: 'DD/MM/YYYY',
  },
  // Canada
  CA: {
    countryCode: 'CA',
    timezone: 'America/Toronto',
    currency: 'CAD',
    dateFormat: 'MM/DD/YYYY',
  },
  // Australia
  AU: {
    countryCode: 'AU',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    dateFormat: 'DD/MM/YYYY',
  },
  // Germany
  DE: {
    countryCode: 'DE',
    timezone: 'Europe/Berlin',
    currency: 'EUR',
    dateFormat: 'DD.MM.YYYY',
  },
  // France
  FR: {
    countryCode: 'FR',
    timezone: 'Europe/Paris',
    currency: 'EUR',
    dateFormat: 'DD/MM/YYYY',
  },
  // Spain
  ES: {
    countryCode: 'ES',
    timezone: 'Europe/Madrid',
    currency: 'EUR',
    dateFormat: 'DD/MM/YYYY',
  },
  // Italy
  IT: {
    countryCode: 'IT',
    timezone: 'Europe/Rome',
    currency: 'EUR',
    dateFormat: 'DD/MM/YYYY',
  },
  // Japan
  JP: {
    countryCode: 'JP',
    timezone: 'Asia/Tokyo',
    currency: 'JPY',
    dateFormat: 'YYYY/MM/DD',
  },
  // China
  CN: {
    countryCode: 'CN',
    timezone: 'Asia/Shanghai',
    currency: 'CNY',
    dateFormat: 'YYYY-MM-DD',
  },
  // India
  IN: {
    countryCode: 'IN',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    dateFormat: 'DD/MM/YYYY',
  },
  // Singapore
  SG: {
    countryCode: 'SG',
    timezone: 'Asia/Singapore',
    currency: 'SGD',
    dateFormat: 'DD/MM/YYYY',
  },
  // Malaysia
  MY: {
    countryCode: 'MY',
    timezone: 'Asia/Kuala_Lumpur',
    currency: 'MYR',
    dateFormat: 'DD/MM/YYYY',
  },
  // Thailand
  TH: {
    countryCode: 'TH',
    timezone: 'Asia/Bangkok',
    currency: 'THB',
    dateFormat: 'DD/MM/YYYY',
  },
  // Indonesia
  ID: {
    countryCode: 'ID',
    timezone: 'Asia/Jakarta',
    currency: 'IDR',
    dateFormat: 'DD/MM/YYYY',
  },
  // Vietnam
  VN: {
    countryCode: 'VN',
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    dateFormat: 'DD/MM/YYYY',
  },
  // South Korea
  KR: {
    countryCode: 'KR',
    timezone: 'Asia/Seoul',
    currency: 'KRW',
    dateFormat: 'YYYY-MM-DD',
  },
  // Brazil
  BR: {
    countryCode: 'BR',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
    dateFormat: 'DD/MM/YYYY',
  },
  // Mexico
  MX: {
    countryCode: 'MX',
    timezone: 'America/Mexico_City',
    currency: 'MXN',
    dateFormat: 'DD/MM/YYYY',
  },
  // Argentina
  AR: {
    countryCode: 'AR',
    timezone: 'America/Argentina/Buenos_Aires',
    currency: 'ARS',
    dateFormat: 'DD/MM/YYYY',
  },
  // South Africa
  ZA: {
    countryCode: 'ZA',
    timezone: 'Africa/Johannesburg',
    currency: 'ZAR',
    dateFormat: 'DD/MM/YYYY',
  },
  // New Zealand
  NZ: {
    countryCode: 'NZ',
    timezone: 'Pacific/Auckland',
    currency: 'NZD',
    dateFormat: 'DD/MM/YYYY',
  },
  // Netherlands
  NL: {
    countryCode: 'NL',
    timezone: 'Europe/Amsterdam',
    currency: 'EUR',
    dateFormat: 'DD-MM-YYYY',
  },
  // Sweden
  SE: {
    countryCode: 'SE',
    timezone: 'Europe/Stockholm',
    currency: 'SEK',
    dateFormat: 'YYYY-MM-DD',
  },
  // Norway
  NO: {
    countryCode: 'NO',
    timezone: 'Europe/Oslo',
    currency: 'NOK',
    dateFormat: 'DD.MM.YYYY',
  },
  // Denmark
  DK: {
    countryCode: 'DK',
    timezone: 'Europe/Copenhagen',
    currency: 'DKK',
    dateFormat: 'DD.MM.YYYY',
  },
  // Switzerland
  CH: {
    countryCode: 'CH',
    timezone: 'Europe/Zurich',
    currency: 'CHF',
    dateFormat: 'DD.MM.YYYY',
  },
  // Poland
  PL: {
    countryCode: 'PL',
    timezone: 'Europe/Warsaw',
    currency: 'PLN',
    dateFormat: 'DD.MM.YYYY',
  },
  // Turkey
  TR: {
    countryCode: 'TR',
    timezone: 'Europe/Istanbul',
    currency: 'TRY',
    dateFormat: 'DD.MM.YYYY',
  },
  // Saudi Arabia
  SA: {
    countryCode: 'SA',
    timezone: 'Asia/Riyadh',
    currency: 'SAR',
    dateFormat: 'DD/MM/YYYY',
  },
  // UAE
  AE: {
    countryCode: 'AE',
    timezone: 'Asia/Dubai',
    currency: 'AED',
    dateFormat: 'DD/MM/YYYY',
  },
};

/**
 * Get country defaults by country code
 */
export function getCountryDefaults(countryCode: string): CountryDefaults | null {
  const upperCode = countryCode.toUpperCase();
  const defaults = COUNTRY_DEFAULTS[upperCode];
  
  if (!defaults) {
    return null;
  }

  // Get country name from Intl API
  const countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(upperCode) || upperCode;

  return {
    country: countryName,
    ...defaults,
  };
}

/**
 * Detect country using IP geolocation API
 * Uses internal API route to avoid CORS issues
 * Falls back to browser locale if API fails
 */
export async function detectCountry(): Promise<CountryDefaults | null> {
  try {
    // Try using internal API route (which proxies to geolocation services)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    
    try {
      const response = await fetch('/api/geolocation/detect', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.countryCode) {
          const defaults = getCountryDefaults(data.countryCode);
          if (defaults) {
            return defaults;
          }
        }
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      // Don't throw, just continue to fallback
      if (fetchError.name !== 'AbortError') {
        console.warn('Failed to detect country via API route:', fetchError.message);
      }
    }
  } catch (error: any) {
    console.warn('Failed to detect country via API route:', error.message);
  }

  // Fallback: Try direct API calls (may have CORS issues in some browsers)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    try {
      const response = await fetch('https://ipapi.co/json/', {
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
          const defaults = getCountryDefaults(data.country_code);
          if (defaults) {
            return defaults;
          }
        }
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      // Don't throw, just continue to fallback
      if (fetchError.name !== 'AbortError') {
        console.warn('Failed to detect country via ipapi.co:', fetchError.message);
      }
    }
  } catch (error: any) {
    console.warn('Failed to detect country via ipapi.co:', error.message);
  }

  // Final fallback: try to detect from browser locale
  if (typeof window !== 'undefined' && navigator.language) {
    try {
      // Try to extract country from locale (e.g., "en-US" -> "US")
      const locale = navigator.language;
      const parts = locale.split('-');
      if (parts.length > 1) {
        const countryCode = parts[parts.length - 1].toUpperCase();
        const defaults = getCountryDefaults(countryCode);
        if (defaults) {
          return defaults;
        }
      }

      // Try to get timezone from Intl API
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const currency = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' })
        .formatToParts(0)
        .find(part => part.type === 'currency')?.value || 'USD';

      // Try to infer country from timezone
      if (timezone.includes('Manila')) {
        return getCountryDefaults('PH');
      } else if (timezone.includes('New_York') || timezone.includes('Los_Angeles')) {
        return getCountryDefaults('US');
      } else if (timezone.includes('London')) {
        return getCountryDefaults('GB');
      } else if (timezone.includes('Tokyo')) {
        return getCountryDefaults('JP');
      }
    } catch (error) {
      console.warn('Failed to detect country from browser locale:', error);
    }
  }

  // Default to Philippines if all else fails
  return getCountryDefaults('PH');
}

/**
 * Get country name from country code
 */
export function getCountryName(countryCode: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode.toUpperCase()) || countryCode;
  } catch {
    return countryCode;
  }
}
