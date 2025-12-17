import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/health/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

describe('Health Check API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
    process.env.SESSION_SECRET = 'test-secret';
  });

  it('should return healthy status when database is connected', async () => {
    const request = new NextRequest('http://localhost:3000/api/health');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('database');
    expect(data.database.connected).toBe(true);
  });

  it('should return unhealthy status when database connection fails', async () => {
    const { default: connectDB } = await import('@/lib/mongodb');
    vi.mocked(connectDB).mockRejectedValue(new Error('Connection failed'));

    const request = new NextRequest('http://localhost:3000/api/health');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('unhealthy');
  });
});

