import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { getPermissionChecker } from '@/app/lib/auth-helpers';

export interface InventoryPermissions {
  /** Add items, restock, adjust, count and edit (inventory:write, the API's check). */
  canWrite: boolean;
  /** Remove an item (inventory:delete). */
  canDelete: boolean;
}

/**
 * Inventory pages follow the inventory permission like the API does. They used to require an
 * admin, which locked out the receptionists and accountants who keep the stock.
 */
export async function loadInventoryPermissions(): Promise<InventoryPermissions> {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  if (!can('inventory', 'read')) redirect('/dashboard?error=access_denied');
  return { canWrite: can('inventory', 'write'), canDelete: can('inventory', 'delete') };
}

/** Pages that change stock or items: inventory:write. */
export async function requireInventoryWriter(): Promise<InventoryPermissions> {
  const permissions = await loadInventoryPermissions();
  if (!permissions.canWrite) redirect('/inventory?error=access_denied');
  return permissions;
}
