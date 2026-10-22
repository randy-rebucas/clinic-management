/** Clinic subdomain from the current hostname, '' on the root domain (incl. www); not called during SSR. */
export function getHostSubdomain(): string {
  const parts = window.location.hostname.split('.');
  const firstPart = parts[0]?.toLowerCase() ?? '';
  const isWww = firstPart === 'www';
  const hasSubdomain = !isWww && (
    (parts.length > 2) ||
    (parts.length === 2 && firstPart !== 'localhost')
  );
  return hasSubdomain ? firstPart : '';
}

export const subscribeNoop = () => () => {};
