import { NextResponse } from 'next/server';

/**
 * Liveness Probe
 * Quick check to verify the service is running
 * Used by Kubernetes and container orchestration
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'alive',
      timestamp: new Date().toISOString(),
    },
    { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }
  );
}
