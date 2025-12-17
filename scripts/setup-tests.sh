#!/bin/bash

# Setup script for testing environment
# This script helps set up the testing environment for MyClinicSoft

echo "🧪 Setting up testing environment for MyClinicSoft..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20.9 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version 20.9 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install test dependencies if not already installed
if [ ! -d "node_modules/vitest" ]; then
    echo "📦 Installing test dependencies..."
    npm install --save-dev vitest @vitest/coverage-v8 @vitest/ui @testing-library/jest-dom @testing-library/react jest jest-environment-jsdom @types/jest
fi

# Create test environment file
if [ ! -f ".env.test" ]; then
    echo "📝 Creating .env.test file..."
    cat > .env.test << EOF
# Test Environment Variables
NODE_ENV=test
MONGODB_URI=mongodb://localhost:27017/myclinicsoft-test
SESSION_SECRET=test-secret-key-for-testing-only-do-not-use-in-production
ENCRYPTION_KEY=test-encryption-key-for-testing-only
EOF
    echo "✅ Created .env.test file"
else
    echo "ℹ️  .env.test already exists"
fi

# Run tests
echo "🧪 Running tests..."
npm run test

echo "✅ Test setup complete!"
echo ""
echo "Available test commands:"
echo "  npm run test              - Run all tests (Vitest)"
echo "  npm run test:watch        - Run tests in watch mode"
echo "  npm run test:coverage     - Run tests with coverage"
echo "  npm run test:ui           - Run tests with UI"
echo "  npm run test:jest         - Run tests with Jest"
echo "  npm run test:jest:watch   - Run Jest tests in watch mode"
echo "  npm run test:jest:coverage - Run Jest tests with coverage"

