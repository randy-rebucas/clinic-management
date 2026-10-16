import { livenessResponse } from '../shared';

/**
 * Liveness Probe
 * Quick check to verify the service is running
 * Used by Kubernetes and container orchestration
 */
export async function GET() {
  return livenessResponse();
}
