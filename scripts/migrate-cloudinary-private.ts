/**
 * Move legacy public Cloudinary uploads (delivery type 'upload') to 'authenticated' delivery,
 * so stored PHI is only reachable through short-lived signed URLs / the app's stream route.
 *
 *   npx tsx scripts/migrate-cloudinary-private.ts                 # dry run (default): counts + masked samples
 *   npx tsx scripts/migrate-cloudinary-private.ts --apply         # migrate
 *   npx tsx scripts/migrate-cloudinary-private.ts --apply --limit 200 --delay 300
 *   npx tsx scripts/migrate-cloudinary-private.ts --apply --include-orphans
 *
 * What it touches:
 *  1. documents: every record with metadata.cloudinaryPublicId or a res.cloudinary.com url/thumbnailUrl.
 *     Public assets are renamed in place to type 'authenticated' (same public id, CDN invalidated), then
 *     the record gets cloudinaryPublicId/ResourceType/DeliveryType('authenticated')/Format metadata, url
 *     becomes the new authenticated delivery URL (unusable without a signature, same shape as new uploads),
 *     and the legacy public thumbnailUrl is removed.
 *  2. embedded attachment URLs (patients, visits, labresults, imagings, procedures, patientnotes,
 *     referrals): a res.cloudinary.com URL whose public id belongs to a Document is replaced by that
 *     document's stream route (/api/documents/{id}/stream). URLs with no Document ("orphans") are only
 *     reported unless --include-orphans is given; then the asset is made authenticated and the URL is
 *     replaced by the authenticated delivery URL (not publicly reachable; there is no stream route for them).
 *  Tenant logos (tenants.logo) are clinic branding shown on public pages and are deliberately left public.
 *
 * Resumable: records already marked 'authenticated' are skipped; an asset already renamed by an
 * interrupted run is detected and only its database record is updated.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose from 'mongoose';

type ResourceType = 'image' | 'video' | 'raw';
type AssetRef = { publicId: string; resourceType: ResourceType; deliveryType: string; format?: string };

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const INCLUDE_ORPHANS = args.includes('--include-orphans');

function numArg(name: string, fallback: number): number {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  const idx = args.indexOf(`--${name}`);
  const raw = eq ? eq.split('=')[1] : idx >= 0 ? args[idx + 1] : undefined;
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

const LIMIT = numArg('limit', Infinity);
const DELAY_MS = numArg('delay', 250);
const SAMPLE = 10;

const CLOUDINARY_URL_RE = /res\.cloudinary\.com\//;

const ATTACHMENT_SOURCES: Array<{ model: string; file: string; field: string }> = [
  { model: 'Patient', file: '../models/Patient', field: 'attachments' },
  { model: 'Visit', file: '../models/Visit', field: 'attachments' },
  { model: 'LabResult', file: '../models/LabResult', field: 'attachments' },
  { model: 'Imaging', file: '../models/Imaging', field: 'images' },
  { model: 'Procedure', file: '../models/Procedure', field: 'attachments' },
  { model: 'PatientNote', file: '../models/PatientNote', field: 'attachments' },
  { model: 'Referral', file: '../models/Referral', field: 'attachments' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Public ids can embed tenant/patient ids in their folders; never print them in full. */
function mask(publicId: string): string {
  const parts = publicId.split('/');
  const last = parts.pop() || '';
  const name = last.length > 8 ? `${last.slice(0, 3)}…${last.slice(-3)}` : '***';
  const folders = parts.map((p, i) => (i === 0 ? p : '*'));
  return [...folders, name].join('/');
}

function errText(e: any): string {
  return String(e?.error?.message || e?.message || e).slice(0, 200);
}

function httpCode(e: any): number | undefined {
  return e?.error?.http_code ?? e?.http_code;
}

const stats = {
  documentsScanned: 0,
  documentsAlreadyPrivate: 0,
  documentsToMigrate: 0,
  documentsMigrated: 0,
  documentsDbOnly: 0,
  documentsFailed: 0,
  attachmentUrlsFound: 0,
  attachmentUrlsLinked: 0,
  attachmentOrphans: 0,
  attachmentOrphansMigrated: 0,
  attachmentFailed: 0,
  skippedByLimit: 0,
};
const samples: string[] = [];
let budget = LIMIT;

function sample(line: string) {
  if (samples.length < SAMPLE) samples.push(line);
}

async function main() {
  const { default: connectDB } = await import('../lib/mongodb');
  const cloud = await import('../lib/cloudinary');
  const { v2: cloudinary } = await import('cloudinary');
  const { default: Document } = await import('../models/Document');

  if (APPLY && !cloud.isCloudinaryConfigured()) {
    console.error('CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET must be set for --apply.');
    process.exit(1);
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.warn('CLOUDINARY_CLOUD_NAME is not set: stored URLs cannot be parsed, only metadata public ids are used.');
  }

  await connectDB();
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to migrate)'}; limit=${LIMIT === Infinity ? 'none' : LIMIT}; delay=${DELAY_MS}ms\n`);

  /**
   * Make the asset authenticated. Tries the recorded resource type first, then the others (legacy
   * uploads used resource_type 'auto' and often only stored the public id). If the public asset is
   * gone but an authenticated one exists, a previous run already renamed it.
   */
  async function makeAuthenticated(ref: AssetRef): Promise<{ resourceType: ResourceType; format?: string; secureUrl?: string; alreadyDone: boolean }> {
    const order: ResourceType[] = [ref.resourceType, ...(['image', 'raw', 'video'] as ResourceType[]).filter((t) => t !== ref.resourceType)];
    for (const resourceType of order) {
      try {
        const res = await cloudinary.uploader.rename(ref.publicId, ref.publicId, {
          type: 'upload',
          to_type: 'authenticated',
          resource_type: resourceType,
          invalidate: true,
        });
        await sleep(DELAY_MS);
        return { resourceType: res.resource_type || resourceType, format: res.format, secureUrl: res.secure_url, alreadyDone: false };
      } catch (e) {
        await sleep(DELAY_MS);
        if (httpCode(e) !== 404) throw e;
      }
    }
    for (const resourceType of order) {
      try {
        const res = await cloudinary.api.resource(ref.publicId, { type: 'authenticated', resource_type: resourceType });
        await sleep(DELAY_MS);
        return { resourceType: res.resource_type || resourceType, format: res.format, secureUrl: res.secure_url, alreadyDone: true };
      } catch (e) {
        await sleep(DELAY_MS);
        if (httpCode(e) !== 404) throw e;
      }
    }
    throw new Error('asset not found as public or authenticated');
  }

  function authenticatedUrl(publicId: string, resourceType: ResourceType, format?: string, secureUrl?: string): string {
    if (secureUrl && cloud.parseCloudinaryUrl(secureUrl)?.deliveryType === 'authenticated') return secureUrl;
    return cloudinary.url(publicId, { resource_type: resourceType, type: 'authenticated', secure: true, ...(format && resourceType !== 'raw' ? { format } : {}) });
  }

  // ── 1. Document records ────────────────────────────────────────────────────
  const cursor = Document.collection.find(
    {
      $or: [
        { 'metadata.cloudinaryPublicId': { $exists: true } },
        { url: { $regex: CLOUDINARY_URL_RE } },
        { thumbnailUrl: { $regex: CLOUDINARY_URL_RE } },
      ],
    },
    { projection: { _id: 1, url: 1, thumbnailUrl: 1, metadata: 1 } }
  );

  for await (const doc of cursor) {
    stats.documentsScanned++;
    const url: string = typeof doc.url === 'string' ? doc.url : '';
    const ref = cloud.cloudinaryRefFromStored(url, doc.metadata) as AssetRef | null;
    const publicThumb = typeof doc.thumbnailUrl === 'string' && CLOUDINARY_URL_RE.test(doc.thumbnailUrl);
    const publicUrl = cloud.parseCloudinaryUrl(url)?.deliveryType === 'upload';
    if (!ref) {
      if (!url.startsWith('data:') && (publicThumb || CLOUDINARY_URL_RE.test(url))) {
        stats.documentsFailed++;
        console.warn(`  ! document ${doc._id}: Cloudinary URL on another cloud or unparseable; review manually`);
      }
      continue;
    }

    const assetPublic = ref.deliveryType === 'upload';
    if (!assetPublic && !publicThumb && !publicUrl) {
      stats.documentsAlreadyPrivate++;
      continue;
    }
    if (budget <= 0) {
      stats.skippedByLimit++;
      continue;
    }
    budget--;
    stats.documentsToMigrate++;
    sample(`document ${doc._id}: ${ref.resourceType}/${ref.deliveryType} ${mask(ref.publicId)}${publicThumb ? ' (+public thumbnail)' : ''}`);
    if (!APPLY) continue;

    try {
      let resourceType = ref.resourceType;
      let format = ref.format;
      let secureUrl: string | undefined;
      if (assetPublic) {
        const moved = await makeAuthenticated(ref);
        resourceType = moved.resourceType;
        format = moved.format || format;
        secureUrl = moved.secureUrl;
        if (moved.alreadyDone) stats.documentsDbOnly++;
        else stats.documentsMigrated++;
      } else {
        stats.documentsDbOnly++;
      }

      const set: Record<string, unknown> = {
        'metadata.cloudinaryPublicId': ref.publicId,
        'metadata.cloudinaryResourceType': resourceType,
        'metadata.cloudinaryDeliveryType': ref.deliveryType === 'private' ? 'private' : 'authenticated',
        'metadata.cloudinaryMigratedAt': new Date(),
      };
      if (format) set['metadata.cloudinaryFormat'] = format;
      if (assetPublic || publicUrl) set.url = authenticatedUrl(ref.publicId, resourceType, format, secureUrl);

      await Document.collection.updateOne(
        { _id: doc._id },
        { $set: set, ...(publicThumb ? { $unset: { thumbnailUrl: '' } } : {}) }
      );
      console.log(`  ✓ document ${doc._id} ${mask(ref.publicId)}`);
    } catch (e) {
      stats.documentsFailed++;
      console.error(`  ✗ document ${doc._id} ${mask(ref.publicId)}: ${errText(e)}`);
    }
  }

  // ── 2. Embedded attachment URLs ────────────────────────────────────────────
  for (const source of ATTACHMENT_SOURCES) {
    let model: mongoose.Model<any>;
    try {
      model = (await import(source.file)).default;
    } catch (e) {
      console.warn(`  ! could not load model ${source.model}: ${errText(e)}`);
      continue;
    }
    const urlPath = `${source.field}.url`;
    const parents = model.collection.find({ [urlPath]: { $regex: CLOUDINARY_URL_RE } }, { projection: { _id: 1, [source.field]: 1 } });

    for await (const parent of parents) {
      const items: any[] = Array.isArray(parent[source.field]) ? parent[source.field] : [];
      const urls = [...new Set(items.map((a) => a?.url).filter((u) => typeof u === 'string' && CLOUDINARY_URL_RE.test(u)))] as string[];

      for (const oldUrl of urls) {
        stats.attachmentUrlsFound++;
        const where = `${source.model} ${parent._id}`;
        const ref = cloud.parseCloudinaryUrl(oldUrl) as AssetRef | null;
        if (!ref) {
          stats.attachmentFailed++;
          console.warn(`  ! ${where}: Cloudinary URL on another cloud or unparseable; review manually`);
          continue;
        }

        const owner = await Document.collection.findOne(
          { 'metadata.cloudinaryPublicId': ref.publicId },
          { projection: { _id: 1 } }
        );
        if (!owner && !INCLUDE_ORPHANS) {
          stats.attachmentOrphans++;
          if (ref.deliveryType === 'upload') sample(`orphan ${where}: ${ref.resourceType}/${ref.deliveryType} ${mask(ref.publicId)} (use --include-orphans)`);
          continue;
        }
        if (!owner && ref.deliveryType !== 'upload') continue;
        if (budget <= 0) {
          stats.skippedByLimit++;
          continue;
        }
        budget--;
        sample(`${where}.${source.field}: ${mask(ref.publicId)} → ${owner ? 'document stream route' : 'authenticated asset'}`);
        if (!APPLY) {
          if (owner) stats.attachmentUrlsLinked++;
          else stats.attachmentOrphans++;
          continue;
        }

        try {
          let newUrl: string;
          if (owner) {
            // The asset itself is migrated through its Document record (pass 1).
            newUrl = `/api/documents/${owner._id}/stream`;
          } else {
            const moved = await makeAuthenticated(ref);
            newUrl = authenticatedUrl(ref.publicId, moved.resourceType, moved.format || ref.format, moved.secureUrl);
          }
          await model.collection.updateOne(
            { _id: parent._id },
            { $set: { [`${source.field}.$[a].url`]: newUrl } },
            { arrayFilters: [{ 'a.url': oldUrl }] }
          );
          if (owner) stats.attachmentUrlsLinked++;
          else stats.attachmentOrphansMigrated++;
          console.log(`  ✓ ${where} ${mask(ref.publicId)}`);
        } catch (e) {
          stats.attachmentFailed++;
          console.error(`  ✗ ${where} ${mask(ref.publicId)}: ${errText(e)}`);
        }
      }
    }
  }

  console.log('\nSample (masked):');
  if (samples.length) samples.forEach((s) => console.log(`  - ${s}`));
  else console.log('  (nothing to migrate)');

  console.log('\nSummary:');
  console.log(`  documents scanned:            ${stats.documentsScanned}`);
  console.log(`  documents already private:    ${stats.documentsAlreadyPrivate}`);
  console.log(`  documents needing migration:  ${stats.documentsToMigrate}`);
  if (APPLY) {
    console.log(`  documents migrated:           ${stats.documentsMigrated}`);
    console.log(`  documents DB-only updates:    ${stats.documentsDbOnly}`);
  }
  console.log(`  documents failed / review:    ${stats.documentsFailed}`);
  console.log(`  attachment Cloudinary URLs:   ${stats.attachmentUrlsFound}`);
  console.log(`  attachment URLs → stream:     ${stats.attachmentUrlsLinked}${APPLY ? '' : ' (would be)'}`);
  console.log(`  attachment orphans:           ${stats.attachmentOrphans}${INCLUDE_ORPHANS ? '' : ' (reported only)'}`);
  if (APPLY && INCLUDE_ORPHANS) console.log(`  orphans migrated:             ${stats.attachmentOrphansMigrated}`);
  console.log(`  attachment failures:          ${stats.attachmentFailed}`);
  if (stats.skippedByLimit) console.log(`  skipped (limit reached):      ${stats.skippedByLimit} — run again to continue`);

  await mongoose.disconnect();
  const failed = stats.documentsFailed + stats.attachmentFailed;
  process.exit(APPLY && failed ? 2 : 0);
}

main().catch(async (e) => {
  console.error('Migration aborted:', errText(e));
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
