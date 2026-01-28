// Re-export auth helpers for backward compatibility
export {
  requireAuth,
  requireRole,
  requireAdmin,
  hasRole,
  getCurrentUser,
  verifyToken,
  isAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from './auth-helpers';

