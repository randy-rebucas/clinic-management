/**
 * The order that paid for the clinic's current period. Written as `lastOrderId`; plans bought
 * before PayPal was removed only have it as `paypalOrderId` (which also held PayMongo ids), so
 * that is read as the fallback until those fields are renamed in the database.
 */
export function currentOrderId(sub: { lastOrderId?: string | null; paypalOrderId?: string | null } | null | undefined): string | undefined {
  return sub?.lastOrderId ?? sub?.paypalOrderId ?? undefined;
}
