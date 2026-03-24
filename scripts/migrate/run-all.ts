/**
 * run-all.ts — Master migration runner
 *
 * Executes all migration scripts in the correct dependency order.
 * Run with:
 *   npx ts-node -r tsconfig-paths/register scripts/migrate/run-all.ts
 *
 * Or add to package.json scripts:
 *   "migrate": "ts-node -r tsconfig-paths/register scripts/migrate/run-all.ts"
 */

import { execSync } from 'child_process';
import path from 'path';

const SCRIPTS = [
  '01-specializations.ts',
  '02-doctors.ts',
  '03-patients.ts',
  '04-appointments.ts',
  '05-invoices.ts',
  '06-medicines.ts',
  '07-inventory.ts',
  '08-staff.ts',
  '09-prescriptions.ts',
  '10-lab-results.ts',
];

const dir = __dirname;
const tsx = path.resolve('node_modules', '.bin', 'tsx');

console.log('═══════════════════════════════════════════════════');
console.log('  MyClinicSoft — MySQL → MongoDB Migration Runner');
console.log('═══════════════════════════════════════════════════\n');
console.log(`Running ${SCRIPTS.length} migration scripts in order…\n`);

let failed = 0;

for (const script of SCRIPTS) {
  const scriptPath = path.join(dir, script);
  console.log(`\n▶  ${script}`);
  console.log('─'.repeat(50));
  try {
    execSync(
      `"${tsx}" "${scriptPath}"`,
      { stdio: 'inherit', env: { ...process.env } }
    );
    console.log(`\n✅  ${script} completed`);
  } catch (e) {
    console.error(`\n❌  ${script} FAILED`);
    failed++;

    // Ask user whether to continue or abort
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question('Continue with remaining scripts? (y/N): ', (answer: string) => {
        rl.close();
        if (answer.toLowerCase() !== 'y') {
          console.log('\nMigration aborted.');
          process.exit(1);
        }
        resolve();
      });
    });
  }
}

console.log('\n═══════════════════════════════════════════════════');
if (failed === 0) {
  console.log('  ✅  All migrations completed successfully!');
} else {
  console.log(`  ⚠️   Migration finished with ${failed} failure(s). Review logs above.`);
}
console.log('═══════════════════════════════════════════════════\n');
