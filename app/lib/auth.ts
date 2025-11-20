// Re-export auth helpers for backward compatibility
export {
  requireAuth,
  requireRole,
  requireAdmin,
  hasRole,
  isAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from './auth-helpers';

