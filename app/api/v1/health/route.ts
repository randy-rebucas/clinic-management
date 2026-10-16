import { fullHealthResponse, livenessResponse, readinessResponse } from '../../health/shared';

/**
 * API v1 Health Check Endpoint
 * Mirrors /api/health for versioned API. Details only for admins / cron bearer token.
 */
export async function GET(request: Request) {
  const path = new URL(request.url).pathname;

  if (path.endsWith('/live')) {
    return livenessResponse({ apiVersion: 'v1' });
  }

  if (path.endsWith('/ready')) {
    return readinessResponse(request, { apiVersion: 'v1' });
  }

  return fullHealthResponse(request, { apiVersion: 'v1' });
}
