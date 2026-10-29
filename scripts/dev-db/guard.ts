/**
 * Local-only guard for the dev database scripts. Restoring with --drop and scrubbing rewrite every
 * collection, so they refuse any URI that isn't a single host on this machine.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The URI's host[:port] list without credentials, for printing. */
export function describeMongoUri(uri: string): string {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(\/[^?]*)?/.exec(uri);
  if (!match) return '(unrecognised URI)';
  const db = match[2] && match[2] !== '/' ? match[2].slice(1) : '(default db)';
  return `${match[1]} / ${db}`;
}

/** Returns the URI when it points at this machine; exits the process otherwise. */
export function assertLocalDatabase(uri: string | undefined): string {
  if (!uri) {
    console.error('❌  MONGODB_URI is not set. Point .env.local at the local database (see docs/LOCAL_DEV_DATABASE.md).');
    process.exit(1);
  }
  const match = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri);
  const hosts = match ? match[1].split(',') : [];
  // One host, port stripped ("[::1]:27017" -> "[::1]"). mongodb+srv never matches: it is always remote.
  const local = hosts.length === 1 && LOCAL_HOSTS.has(hosts[0].replace(/:\d+$/, '').toLowerCase());
  if (!local) {
    console.error(`❌  Refusing: MONGODB_URI points at ${describeMongoUri(uri)}, not a database on this machine.`);
    console.error('   These scripts drop and rewrite collections; they only run against the local Docker database.');
    process.exit(1);
  }
  return uri;
}
