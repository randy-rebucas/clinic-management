/** The rep app's (eMedRoute) URL scheme (clinic-management-rep app.json `scheme`). */
export const REP_APP_SCHEME = 'emedroute';

/**
 * Where the payment pages may send the browser back to: the rep app's own scheme, and in
 * development Expo Go's `exp://` links. Anything else would make the return pages an open redirect.
 * Safe to import from client components.
 */
export function isAllowedAppReturnUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 500) return false;
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return false;
  }
  if (protocol === `${REP_APP_SCHEME}:`) return true;
  return process.env.NODE_ENV !== 'production' && (protocol === 'exp:' || protocol === 'exps:');
}
