// i18n config scaffold for Next.js
// This is a starting point for adding internationalization support

export const locales = ['en', 'es', 'fr']; // Add more as needed
export const defaultLocale = 'en';

export function getLocaleFromRequest(request: Request) {
  const accept = request.headers.get('accept-language');
  if (!accept) return defaultLocale;
  const found = locales.find(l => accept.includes(l));
  return found || defaultLocale;
}

// Usage: Wrap UI components with a translation provider or use this in API routes
