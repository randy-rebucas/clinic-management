import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string | null;
  /**
   * True for cron jobs / admin tooling that legitimately need to operate
   * across all tenants. Set only via runAsSystem(), never from a request path.
   */
  bypass: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Run `fn` with the given tenantId bound to every tenant-scoped Prisma query
 * made inside it (see lib/prisma-tenant-extension.ts). Call this once per
 * request, as early as possible (middleware.ts or a route wrapper), using the
 * tenantId resolved from the session/JWT — the same value that today's
 * per-route Mongoose queries add to `{ tenantId }` manually.
 */
export function runWithTenant<T>(tenantId: string, fn: () => T | Promise<T>): T | Promise<T> {
  return storage.run({ tenantId, bypass: false }, fn);
}

/**
 * Run `fn` with tenant scoping disabled entirely. Reserved for cron routes
 * (protected by CRON_SECRET) and admin/system operations that must read or
 * write across all tenants. Never call this from a user-facing request path.
 */
export function runAsSystem<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return storage.run({ tenantId: null, bypass: true }, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}
