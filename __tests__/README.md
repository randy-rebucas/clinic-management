# Testing Framework

This directory contains automated tests for MyClinicSoft.

## Test Frameworks

The project uses two testing frameworks:

1. **Vitest** - Fast, modern testing framework (recommended)
2. **Jest** - Alternative testing framework (for compatibility)

## Running Tests

### Vitest (Recommended)

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### Jest

```bash
# Run all tests
npm run test:jest

# Run tests in watch mode
npm run test:jest:watch

# Run tests with coverage
npm run test:jest:coverage
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

- Use test database or in-memory database
- Clean up test data after each test
- Use factories for test data generation

## Continuous Integration

Tests should run automatically in CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm run test:coverage
```

## Notes

- Tests are currently in development
- Start with critical paths (authentication, payments, data integrity)
- Gradually increase coverage over time

