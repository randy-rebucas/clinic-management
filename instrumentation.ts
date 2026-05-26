export async function register() {
  // Only run on the Node.js runtime (server), not on the Edge runtime.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./lib/env-validation');
    validateEnv(); // throws in production if required vars are missing or malformed
  }
}
