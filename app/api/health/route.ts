import { fullHealthResponse } from './shared';

/**
 * Health Check Endpoint
 *
 * Endpoints:
 * - GET /api/health - Health check (details only for admins / cron bearer token)
 * - GET /api/health/live - Liveness probe (quick check)
 * - GET /api/health/ready - Readiness probe
 */
export async function GET(request: Request) {
  return fullHealthResponse(request);
}
