/**
 * Migration Utilities
 * Shared helpers for all MySQL → MongoDB migration scripts.
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// ---------------------------------------------------------------------------
// DB Connection
// ---------------------------------------------------------------------------

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not defined in .env.local');
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
    console.log('✅  Connected to MongoDB');
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  console.log('✅  Disconnected from MongoDB');
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/** Parse a CSV file exported from phpMyAdmin into an array of row objects. */
export function readCSV(filePath: string): Record<string, string>[] {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`CSV file not found: ${absPath}`);
  }
  const raw = fs.readFileSync(absPath, 'utf-8');
  return parse(raw, {
    columns: true,          // first row = headers
    skip_empty_lines: true,
    trim: true,
    bom: true,              // handle BOM from some phpMyAdmin exports
  });
}

// ---------------------------------------------------------------------------
// ID Map helpers
// Persist old MySQL integer IDs → new MongoDB ObjectIds so that foreign-key
// references can be resolved across scripts run in separate processes.
// ---------------------------------------------------------------------------

const ID_MAP_DIR = path.resolve(__dirname, '../../exports/id-maps');

export function saveIdMap(entity: string, map: Record<string, string>): void {
  fs.mkdirSync(ID_MAP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(ID_MAP_DIR, `${entity}.json`),
    JSON.stringify(map, null, 2),
    'utf-8'
  );
  console.log(`💾  Saved ID map for "${entity}" (${Object.keys(map).length} entries)`);
}

export function loadIdMap(entity: string): Record<string, string> {
  const file = path.join(ID_MAP_DIR, `${entity}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`⚠️  ID map for "${entity}" not found. Skipping FK resolution.`);
    return {};
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

/** Convert a MySQL date string (YYYY-MM-DD or YYYY-MM-DD HH:mm:ss) to Date. */
export function toDate(val: string | undefined): Date | undefined {
  if (!val || val === '0000-00-00' || val === '') return undefined;
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Map a MySQL tinyint(1) / 0|1 string to boolean. */
export function toBool(val: string | undefined, defaultVal = false): boolean {
  if (val === undefined || val === null || val === '') return defaultVal;
  return val === '1' || val.toLowerCase() === 'true' || val.toLowerCase() === 'yes';
}

/** Return a trimmed string or undefined if empty. */
export function str(val: string | undefined): string | undefined {
  const s = (val ?? '').trim();
  return s === '' ? undefined : s;
}

/** Return a number or undefined if empty / NaN. */
export function num(val: string | undefined): number | undefined {
  if (val === undefined || val === null || val.trim() === '') return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

/** Resolve an ObjectId string from an id-map, or return undefined. */
export function resolve(
  map: Record<string, string>,
  mysqlId: string | undefined
): string | undefined {
  if (!mysqlId || mysqlId === '0' || mysqlId === '') return undefined;
  const id = map[mysqlId];
  if (!id) console.warn(`  ⚠️  Could not resolve foreign key: ${mysqlId}`);
  return id;
}

/** Print a summary line. */
export function logSummary(entity: string, total: number, skipped: number): void {
  const imported = total - skipped;
  console.log(`\n📊  ${entity}: ${imported} imported, ${skipped} skipped (${total} total rows)`);
}
