# Testing Framework

This directory contains automated tests for MyClinicSoft.

## Test Framework

Tests use **Vitest** (`vitest.config.ts`). Jest is not used.

## Running Tests

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:coverage

# Run tests with UI
pnpm run test:ui
```

## Test Structure

```
__tests__/
├── lib/              # Unit tests for utilities
├── api/              # Integration tests for API routes
├── components/       # Component tests
└── e2e/              # End-to-end tests
```

## Writing Tests

### Example: Unit Test

```typescript
import { describe, it, expect, vi } from 'vitest';
import { formatBytes } from '@/lib/storage-tracking';

describe('formatBytes', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
  });
});
```

### Example: API Test

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/health/route';
import { NextRequest } from 'next/server';

describe('Health Check API', () => {
  it('should return healthy status', async () => {
    const request = new NextRequest('http://localhost:3000/api/health');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
  });
});
```

## Coverage Goals

- **Unit Tests:** 70%+ coverage
- **Integration Tests:** All API endpoints
- **E2E Tests:** Critical user flows

## Mocking

Tests use Vitest's mocking capabilities:

```typescript
vi.mock('@/lib/mongodb', () => ({
  default: vi.fn(),
}));
```

## Test Data

- Never connect to a real database: mock `@/lib/mongodb` and the models a test touches
  (`vitest.config.ts` points MONGODB_URI at an unreachable address as a safeguard)
- Clean up test data after each test
- Use factories for test data generation

## Continuous Integration

Tests should run automatically in CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run tests
  run: pnpm run test:coverage
```

## Notes

- Tests are currently in development
- Start with critical paths (authentication, payments, data integrity)
- Gradually increase coverage over time

