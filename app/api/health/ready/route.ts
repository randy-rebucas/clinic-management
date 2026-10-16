import { readinessResponse } from '../shared';

/**
 * Readiness Probe
 * Verifies the service is ready to accept traffic. Used by Kubernetes and load balancers.
 */
export async function GET(request: Request) {
  return readinessResponse(request);
}
