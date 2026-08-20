import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// CLI-only config (migrate, studio, db push, etc.). The application's runtime
// PrismaClient is constructed separately in lib/prisma.ts with the pg driver
// adapter and the tenant-scoping extension — this file has no bearing on that.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
