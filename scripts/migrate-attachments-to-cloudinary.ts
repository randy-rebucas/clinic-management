/**
 * Moves files stored inline in patient, visit and lab-result records (attachments[].url as a
 * base64 data URL) to Cloudinary as authenticated (non-public) assets, leaving only the delivery
 * URL on the record. Inline files count against MongoDB's 16 MB document limit; once a record is
 * full, every further upload to it fails. New uploads already go to Cloudinary when it is
 * configured (lib/attachment-file.ts); this moves the ones from before.
 *
 *   npx tsx scripts/migrate-attachments-to-cloudinary.ts                     # dry run (default): counts only
 *   npx tsx scripts/migrate-attachments-to-cloudinary.ts --apply             # migrate
 *   npx tsx scripts/migrate-attachments-to-cloudinary.ts --apply --limit 200 # at most 200 files this run
 *
 * Resumable: a file is replaced only after its upload succeeded, and moved files are no longer
 * inline, so a rerun picks up where the last one stopped. Requires CLOUDINARY_* to be set.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose, { Types } from 'mongoose';
import { isCloudinaryConfigured, safeFolderSegment, uploadToCloudinary } from '../lib/cloudinary';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg >= 0 ? Math.max(1, Number(args[limitArg + 1]) || 0) : Infinity;

const TARGETS = [
  { collection: 'patients', kind: 'patient' },
  { collection: 'visits', kind: 'visit' },
  { collection: 'labresults', kind: 'lab-result' },
] as const;

interface Row {
  _id: Types.ObjectId;
  tenantId?: Types.ObjectId;
  attachments?: { _id: Types.ObjectId; url?: string; contentType?: string; tenantId?: Types.ObjectId }[];
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!isCloudinaryConfigured()) throw new Error('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET)');

  console.log(APPLY ? 'MODE: APPLY (uploading and rewriting records)' : 'MODE: DRY RUN (no changes; pass --apply to write)');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name}`);
  const db = mongoose.connection.db!;

  let moved = 0;
  let failed = 0;
  for (const { collection, kind } of TARGETS) {
    const coll = db.collection<Row>(collection);
    const filter = { 'attachments.url': { $regex: /^data:/ } };
    const records = await coll.countDocuments(filter);
    let files = 0;
    let bytes = 0;

    const cursor = coll.find(filter, { projection: { tenantId: 1, 'attachments._id': 1, 'attachments.url': 1, 'attachments.contentType': 1, 'attachments.tenantId': 1 } });
    for await (const row of cursor) {
      for (const a of row.attachments ?? []) {
        const m = a.url ? /^data:([^;,]+);base64,([\s\S]*)$/.exec(a.url) : null;
        if (!m) continue;
        const buffer = Buffer.from(m[2], 'base64');
        files++;
        bytes += buffer.length;
        if (!APPLY || moved >= LIMIT) continue;

        // Patient records are shared; their files carry the uploading clinic (attachments[].tenantId).
        const owner = String(a.tenantId ?? row.tenantId ?? 'shared');
        const contentType = (a.contentType || m[1]).toLowerCase();
        const result = await uploadToCloudinary(buffer, {
          folder: `clinic-attachments/${safeFolderSegment(owner, 'tenant')}/${kind}`,
          resourceType: contentType.startsWith('image/') ? 'image' : 'raw',
          deliveryType: 'authenticated',
          contentType,
        });
        if (!result.success || !result.data) {
          failed++;
          console.error(`  ${collection} ${row._id} file ${a._id}: upload failed`);
          continue;
        }
        await coll.updateOne(
          { _id: row._id },
          { $set: { 'attachments.$[a].url': result.data.secure_url } },
          { arrayFilters: [{ 'a._id': a._id }] }
        );
        moved++;
      }
      if (APPLY && moved >= LIMIT) break;
    }
    console.log(`${collection}: ${records} records with inline files, ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  }

  if (APPLY) console.log(`moved ${moved} files, ${failed} failed${moved >= LIMIT ? ` (stopped at --limit ${LIMIT}; run again for the rest)` : ''}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
