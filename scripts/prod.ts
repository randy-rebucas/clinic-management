/**
 * Run a package script against production, on purpose.
 *
 *   pnpm prod <script> [args...]          e.g. pnpm prod db:indexes --drop
 *   pnpm prod --yes <script> [args...]    skip the confirmation (automation)
 *
 * .env.local points at the local database. Production settings live in .env.prod.local (gitignored,
 * and not a name Next.js loads on its own). They are passed to the script as real environment
 * variables, which win over anything the script or Next.js reads from .env files.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { spawnSync } from 'child_process';
import { describeMongoUri } from './dev-db/guard';

const ENV_FILE = path.resolve(process.cwd(), '.env.prod.local');

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  const args = process.argv.slice(2);
  const yes = args[0] === '--yes';
  if (yes) args.shift();
  const [script, ...rest] = args;
  if (!script) {
    console.error('Usage: pnpm prod [--yes] <script> [args...]   e.g. pnpm prod db:indexes --drop');
    process.exit(1);
  }
  if (!fs.existsSync(ENV_FILE)) {
    console.error('❌  .env.prod.local not found. Put the production settings there (see docs/LOCAL_DEV_DATABASE.md).');
    process.exit(1);
  }
  const prod = dotenv.parse(fs.readFileSync(ENV_FILE));
  if (!prod.MONGODB_URI) {
    console.error('❌  .env.prod.local has no MONGODB_URI.');
    process.exit(1);
  }

  console.log('\n⚠️   PRODUCTION');
  console.log(`    database: ${describeMongoUri(prod.MONGODB_URI)}`);
  console.log(`    command:  pnpm run ${[script, ...rest].join(' ')}\n`);
  if (!yes && !(await confirm('Run it against production? [y/N] '))) {
    console.log(process.stdin.isTTY ? 'Cancelled.' : 'Cancelled (no terminal to confirm in; pass --yes to skip the question).');
    process.exit(1);
  }

  // pnpm is a .cmd shim on Windows, which only starts through a shell; Node then wants one
  // command string, so quote anything with spaces or quotes in it.
  const env = { ...process.env, ...prod };
  const quote = (a: string) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const r =
    process.platform === 'win32'
      ? spawnSync(['pnpm', 'run', script, ...rest].map(quote).join(' '), { stdio: 'inherit', env, shell: true })
      : spawnSync('pnpm', ['run', script, ...rest], { stdio: 'inherit', env });
  process.exit(r.status ?? 1);
}

main();
