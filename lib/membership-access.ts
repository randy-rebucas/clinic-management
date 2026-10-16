// Who may do what with memberships. One rule for the pages and the API.
//
// A membership is a billing matter (it is a discount on the bill and a points balance), so it
// follows the invoices permission, with `memberships:*` for roles granted it explicitly. It used
// to follow `patients:read`, which let medical representatives list every member.

type Can = (resource: string, action: string) => boolean;

export interface MembershipPermissions {
  /** See the list and records. */
  canRead: boolean;
  /** Enrol a patient (at Bronze unless `canManage`). */
  canEnrol: boolean;
  /** Add points earned and use points (the billing desk). */
  canPoints: boolean;
  /** Renew for another year. */
  canRenew: boolean;
  /** Change tier, suspend or reactivate, set dates, correct points, edit notes. */
  canManage: boolean;
}

export function membershipPermissions(can: Can): MembershipPermissions {
  const manage = can('memberships', 'write');
  const billing = can('invoices', 'write');
  return {
    canRead: manage || can('memberships', 'read') || can('invoices', 'read'),
    canEnrol: manage || billing,
    canPoints: manage || billing,
    canRenew: manage || billing,
    canManage: manage,
  };
}
