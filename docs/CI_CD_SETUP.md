# CI/CD Setup Guide

This guide explains how to set up Continuous Integration and Continuous Deployment for MyClinicSoft.

## Overview

The CI/CD pipeline includes:

1. **Automated Testing** - Run tests on every push/PR
2. **Linting** - Check code quality
3. **Build Verification** - Ensure production build works
4. **Deployment** - Automatic deployment to staging/production

## GitHub Actions

### Test Workflow

The test workflow (`.github/workflows/tests.yml`) runs on:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Steps:**
1. Checkout code
2. Setup Node.js
3. Install dependencies
4. Run linter
5. Run tests with coverage
6. Upload coverage reports

### Setup

1. **Enable GitHub Actions**
   - Go to repository Settings → Actions
   - Enable GitHub Actions

2. **Add Secrets** (if needed)
   - Go to repository Settings → Secrets and variables → Actions
   - Add `MONGODB_URI_TEST` (optional, uses default if not set)

3. **Push Code**
   - Push to `main` or `develop` branch
   - Workflow will run automatically

### View Results

- Go to repository → Actions tab
- Click on workflow run to see results
- View test coverage in Codecov (if configured)

## Manual Testing

### Before Committing

```bash
# Run linter
npm run lint

# Run tests
npm run test

# Run build
npm run build
```

### Before Pushing

```bash
# Run all checks
npm run lint && npm run test && npm run build
```

## Deployment Workflows

### Staging Deployment

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      - name: Deploy to Vercel Staging
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod=false'
```

### Production Deployment

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - name: Deploy to Vercel Production
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

## Environment Variables

### Required for CI/CD

- `MONGODB_URI_TEST` - Test database (optional)
- `SESSION_SECRET` - For testing (can use test value)
- `NODE_ENV=test` - Set automatically in CI

### Required for Deployment

- `MONGODB_URI` - Production database
- `SESSION_SECRET` - Production secret
- `CRON_SECRET` - For cron jobs
- `ENCRYPTION_KEY` - For data encryption
- Other service credentials (SMTP, Twilio, Cloudinary, etc.)

## Code Coverage

### View Coverage

1. Run tests with coverage:
   ```bash
   npm run test:coverage
   ```

2. Open coverage report:
   ```bash
   open coverage/index.html
   ```

### Coverage Thresholds

Configured in `vitest.config.ts`:

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

## Best Practices

### 1. Run Tests Locally First

Always run tests before pushing:

```bash
npm run test
```

### 2. Fix Linter Errors

Fix all linter errors before committing:

```bash
npm run lint
```

### 3. Write Tests for New Features

When adding new features:

1. Write tests first (TDD)
2. Implement feature
3. Ensure tests pass
4. Commit with tests

### 4. Keep Tests Fast

- Mock external dependencies
- Use test database
- Avoid slow operations

### 5. Test Critical Paths

Prioritize testing:

1. Authentication flows
2. Payment processing
3. Data integrity
4. Security features

## Troubleshooting

### Tests Fail in CI but Pass Locally

**Possible causes:**
- Environment variables missing
- Database connection issues
- Time zone differences
- File path differences

**Solution:**
- Check CI logs
- Ensure all environment variables are set
- Use same Node.js version locally

### Coverage Not Uploading

**Solution:**
- Check Codecov token is set
- Verify coverage file exists
- Check workflow permissions

### Build Fails in CI

**Solution:**
- Check build logs
- Ensure all dependencies are in package.json
- Verify Node.js version matches

## Next Steps

1. **Set Up Codecov**
   - Sign up at codecov.io
   - Add repository
   - Add token to GitHub secrets

2. **Add More Workflows**
   - Staging deployment
   - Production deployment
   - Security scanning

3. **Improve Coverage**
   - Add more unit tests
   - Add integration tests
   - Add E2E tests

---

**Note:** CI/CD is an ongoing process. Start simple and add more automation over time.

