/**
 * Host → clinic subdomain. No server-only imports, so the proxy (edge) can use it too.
 * `www` and the bare root domain are the MyClinicSoft site; any other subdomain is a clinic.
 */
export function extractSubdomain(host?: string | null): string | null {
  if (!host) return null;

  const hostname = host.split(':')[0].toLowerCase(); // Remove port if present
  const rootDomain = process.env.ROOT_DOMAIN || 'localhost';

  // Local development environment
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    if (hostname.includes('.localhost')) {
      const parts = hostname.split('.');
      if (parts.length > 1 && parts[0] !== 'www') {
        return parts[0];
      }
    }
    return null;
  }

  const rootDomainFormatted = rootDomain.split(':')[0].toLowerCase();

  // Handle preview deployment URLs (tenant---branch-name.vercel.app)
  if (hostname.includes('---') && hostname.endsWith('.vercel.app')) {
    const parts = hostname.split('---');
    return parts.length > 0 ? parts[0] : null;
  }

  // Regular subdomain detection
  const isSubdomain =
    hostname !== rootDomainFormatted &&
    hostname !== `www.${rootDomainFormatted}` &&
    hostname.endsWith(`.${rootDomainFormatted}`);

  return isSubdomain ? hostname.replace(`.${rootDomainFormatted}`, '') : null;
}

/**
 * Host of the main site (no clinic subdomain) for a request host, e.g. "localhost:3000" for
 * "my-clinic.localhost:3000". ROOT_DOMAIN wins; locally it may be unset, so the clinic label
 * is stripped from the request host instead.
 */
export function mainSiteHost(requestHost: string): string {
  const configured = process.env.ROOT_DOMAIN?.trim().replace(/^\./, '');
  return configured || requestHost.replace(/^[^.]+\./, '');
}

/**
 * Staff pages are served only on the signed-in user's clinic subdomain. Returns the address the
 * request must go to instead, or null when it is already on the right host (or on a Vercel
 * preview, which must not bounce to production). `path` must be a local path; anything else
 * falls back to /dashboard so the result can never point off-site.
 */
export function clinicHostRedirect(
  requestHost: string,
  proto: string,
  clinicSubdomain: string,
  path: string,
): string | null {
  const host = requestHost.toLowerCase();
  if (!host || host.split(':')[0].endsWith('.vercel.app')) return null;
  const target = `${clinicSubdomain.toLowerCase()}.${mainSiteHost(host)}`;
  if (target === host) return null;
  const safePath = path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/dashboard';
  return `${proto}://${target}${safePath}`;
}

/**
 * MyClinicSoft's own pages (product marketing, rep onboarding). On a clinic subdomain
 * they'd sit under the clinic's name, so the proxy sends them to the main site instead.
 */
export const MARKETING_ONLY_PATHS = [
  '/features',
  '/pricing',
  '/compare',
  '/integrations',
  '/security',
  '/about',
  '/support',
  '/resources',
  '/contact',
  '/faq',
  '/demo',
  '/medical-representatives',
  '/marketing-funnel',
  '/delete-account',
];

export function isMarketingOnlyPath(pathname: string): boolean {
  return MARKETING_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Registering a new clinic is a main-site action only. On a clinic's subdomain the sign-up
 * page doesn't exist and its API refuses: a clinic's website must never become a way to
 * create another clinic.
 */
export const CLINIC_SIGNUP_PAGE = '/tenant-onboard';
export const CLINIC_SIGNUP_API = '/api/tenants/onboard';

