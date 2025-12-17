# Testing Guide

This guide provides comprehensive information about testing in MyClinicSoft.

## Overview

MyClinicSoft uses two testing frameworks:

1. **Vitest** (Recommended) - Fast, modern testing framework
2. **Jest** - Alternative testing framework for compatibility

## Quick Start

### Setup

```bash
# Install dependencies (includes test dependencies)
npm install

# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Setup Script

Use the automated setup script:

```bash
chmod +x scripts/setup-tests.sh
./scripts/setup-tests.sh
```

## Test Commands

### Vitest (Recommended)

```bash
# Run all tests
npm run test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with UI (interactive)
npm run test:ui
```

### Jest (Alternative)

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
├── lib/                    # Unit tests for utilities
│   ├── subscription-limits.test.ts
│   ├── storage-tracking.test.ts
│   ├── insurance-verification.test.ts
│   ├── queue-optimization.test.ts
│   └── data-retention.test.ts
├── api/                    # Integration tests for API routes
│   ├── health.test.ts
│   └── appointments.test.ts
├── components/             # Component tests (to be added)
└── e2e/                    # End-to-end tests (to be added)
```

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatBytes } from '@/lib/storage-tracking';

describe('formatBytes', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
  });
});
```

### API Test Example

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

### Mocking Dependencies

```typescript
// Mock MongoDB
vi.mock('@/lib/mongodb', () => ({
  default: vi.fn(),
}));

// Mock Models
vi.mock('@/models/Patient', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

// Mock Utilities
vi.mock('@/lib/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));
```

## Test Coverage Goals

### Current Coverage

- **Unit Tests:** ~10% (in progress)
- **Integration Tests:** ~5% (in progress)
- **E2E Tests:** 0% (planned)

### Target Coverage

- **Unit Tests:** 70%+ coverage
- **Integration Tests:** All API endpoints
- **E2E Tests:** Critical user flows

## Testing Best Practices

### 1. Test Structure

- Use `describe` blocks to group related tests
- Use `it` or `test` for individual test cases
- Use descriptive test names

### 2. Arrange-Act-Assert Pattern

```typescript
it('should calculate total correctly', () => {
  // Arrange
  const items = [10, 20, 30];
  
  // Act
  const total = items.reduce((a, b) => a + b, 0);
  
  // Assert
  expect(total).toBe(60);
});
```

### 3. Mock External Dependencies

- Mock database calls
- Mock external APIs
- Mock file system operations
- Mock time-dependent functions

### 4. Test Isolation

- Each test should be independent
- Use `beforeEach` to reset state
- Clean up after tests

### 5. Test Edge Cases

- Test with null/undefined values
- Test with empty arrays/objects
- Test with invalid inputs
- Test boundary conditions

## Running Specific Tests

### Run tests in a specific file

```bash
npm run test __tests__/lib/subscription-limits.test.ts
```

### Run tests matching a pattern

```bash
npm run test -- -t "subscription"
```

### Run tests in a specific directory

```bash
npm run test __tests__/lib/
```

## Coverage Reports

### Generate Coverage Report

```bash
npm run test:coverage
```

### View Coverage Report

Coverage reports are generated in the `coverage/` directory:

- HTML report: `coverage/index.html`
- JSON report: `coverage/coverage-final.json`

### Coverage Thresholds

Coverage thresholds are configured in `vitest.config.ts`:

```typescript
coverage: {
  thresholds: {
    lines: 70,
    functions: 70,
    branches: 70,
    statements: 70,
  },
}
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run test:coverage
```

## Debugging Tests

### Debug in VS Code

1. Set breakpoints in test files
2. Open Run and Debug panel
3. Select "Debug Tests" configuration
4. Start debugging

### Debug with Console

```typescript
it('should debug test', () => {
  const result = someFunction();
  console.log('Result:', result);
  expect(result).toBe(expected);
});
```

## Common Issues

### Issue: Tests timeout

**Solution:** Increase timeout in test configuration

```typescript
it('should complete long operation', async () => {
  // ...
}, { timeout: 10000 }); // 10 seconds
```

### Issue: Mock not working

**Solution:** Ensure mocks are set up before imports

```typescript
vi.mock('@/lib/mongodb', () => ({
  default: vi.fn(),
}));

// Import after mock
import { someFunction } from '@/lib/some-module';
```

### Issue: Database connection errors

**Solution:** Use test database or mock database

```typescript
// Use test database
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

// Or mock database
vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));
```

## Next Steps

1. **Add More Unit Tests**
   - Test all utility functions
   - Test business logic
   - Test calculations

2. **Add Integration Tests**
   - Test all API endpoints
   - Test database operations
   - Test authentication flows

3. **Add E2E Tests**
   - Test critical user flows
   - Test appointment booking
   - Test patient registration

4. **Set Up CI/CD**
   - Automate test runs
   - Generate coverage reports
   - Block merges on test failures

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Jest Documentation](https://jestjs.io/)
- [Testing Library](https://testing-library.com/)
- [Next.js Testing](https://nextjs.org/docs/app/building-your-application/testing)

---

**Note:** Testing is an ongoing process. Start with critical paths and gradually increase coverage.

