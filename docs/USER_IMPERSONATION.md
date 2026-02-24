# User Impersonation Feature Plan

1. Add admin-only API endpoint to impersonate users (e.g., POST /api/admin/impersonate).
2. Store impersonation state in session/JWT, log all actions for audit.
3. UI: Add "Impersonate" button in admin user management page.
4. Show banner when impersonating another user, allow reverting.
5. Document in docs/USER_IMPERSONATION.md.

Security notes:
- Only allow admins to impersonate.
- Log all impersonation actions in audit logs.
- Prevent impersonation of other admins.

Next steps:
- Scaffold API and UI
- Update audit logging
- Document feature
