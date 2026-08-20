import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { validateEnv } from './env-validation';
import { withTenantScoping } from './prisma-tenant-extension';

// Validate environment variables on first import (only in production), mirroring lib/mongodb.ts.
if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
  validateEnv();
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Please define the DATABASE_URL environment variable inside .env.local');
  }

  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({ adapter });
  return client.$extends(withTenantScoping());
}

type ScopedPrismaClient = ReturnType<typeof createPrismaClient>;

declare global {

  var prismaClient: ScopedPrismaClient | undefined;
}

// Global-cache singleton, same rationale as lib/mongodb.ts: survive Next.js dev
// hot-reload without opening a new connection pool on every module reload.
export const prisma: ScopedPrismaClient = global.prismaClient ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prismaClient = prisma;
}

export default prisma;
