// Cloudinary configuration and utilities
// Set environment variables: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

// Configure Cloudinary
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true, // Use HTTPS
  });
}

/** How long an upload or a download may take before it is given up. */
const CLOUDINARY_TIMEOUT_MS = 60_000;

export interface UploadOptions {
  folder?: string; // Folder path in Cloudinary
  publicId?: string; // Custom public ID
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  /**
   * Delivery type. Defaults to 'authenticated': the asset is not reachable by a public URL
   * and must be fetched with a short-lived signed URL (see getPrivateDownloadUrl).
   */
  deliveryType?: 'authenticated' | 'private' | 'upload';
  format?: string; // Force format conversion
  transformation?: any; // Image transformations
  tags?: string[]; // Tags for organization
  context?: { [key: string]: string }; // Custom metadata
}

export interface UploadResult {
  public_id: string;
  secure_url: string;
  url: string;
  format: string;
  width?: number;
  height?: number;
  bytes: number;
  resource_type: string;
  type: string; // delivery type: 'authenticated' | 'private' | 'upload'
  created_at: string;
}

/**
 * Upload file to Cloudinary. The bytes are streamed to the upload API as they are, not
 * re-encoded as a base64 data URI (a third bigger, and a second copy in memory).
 */
export async function uploadToCloudinary(
  file: File | Buffer,
  options: UploadOptions & { folder: string }
): Promise<{ success: boolean; data?: UploadResult; error?: string }> {
  // The account is shared: nothing of this app may land outside its own root (see ownedUploadOptions).
  if (!options.folder.startsWith(`${CLOUDINARY_ROOT_FOLDER}/`)) {
    console.error(`Refusing a Cloudinary upload outside ${CLOUDINARY_ROOT_FOLDER}/: ${options.folder}`);
    return { success: false, error: 'Failed to upload file' };
  }

  // Check if Cloudinary is configured
  if (!isCloudinaryConfigured()) {
    return {
      success: false,
      error: 'Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.',
    };
  }

  try {
    const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;

    const uploadOptions: Record<string, unknown> = {
      folder: options.folder,
      resource_type: options.resourceType || 'auto',
      type: options.deliveryType || 'authenticated',
      tags: options.tags || [],
      context: options.context || {},
      timeout: CLOUDINARY_TIMEOUT_MS,
    };
    if (options.publicId) uploadOptions.public_id = options.publicId;
    if (options.format) uploadOptions.format = options.format;
    if (options.transformation) uploadOptions.transformation = options.transformation;

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, res) => {
        if (error || !res) reject(error ?? new Error('Cloudinary returned no upload result'));
        else resolve(res);
      });
      stream.end(buffer);
    });

    return {
      success: true,
      data: {
        public_id: result.public_id,
        secure_url: result.secure_url,
        url: result.url,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        resource_type: result.resource_type,
        type: result.type || String(uploadOptions.type),
        created_at: result.created_at,
      },
    };
  } catch (error: any) {
    console.error('Error uploading to Cloudinary:', error);
    return {
      success: false,
      error: 'Failed to upload file',
    };
  }
}

/** Make a client-supplied value safe to use as a Cloudinary folder segment or tag. */
export function safeFolderSegment(value: string | undefined | null, fallback = 'other'): string {
  const cleaned = String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 50);
  return cleaned.replace(/^_+|_+$/g, '') || fallback;
}

// ── Folder layout ──────────────────────────────────────────────────────────────
//
// The Cloudinary account is shared with other apps, so everything this app stores lives under
// one root folder, then one folder per clinic, then one per kind of file:
//
//   {root}/{tenant_slug}/{type}/{asset}      e.g. myclinicsoft/sunrise-clinic/visit-files/abc123
//
// The clinic folder is its subdomain (Tenant.subdomain: lowercase letters, digits and hyphens,
// unique, never changed by the app). Every asset is also tagged with the clinic's id
// (tenantTag), which still identifies the owner if a deleted clinic's subdomain is reused.
// Patient identifiers never appear in folders or tags: both show in URLs and the console.

/** This app's top folder in the shared account (CLOUDINARY_ROOT_FOLDER, default "myclinicsoft"). */
export const CLOUDINARY_ROOT_FOLDER = safeFolderSegment(process.env.CLOUDINARY_ROOT_FOLDER, 'myclinicsoft');

/** The kinds of file, one folder each. */
export const ASSET_TYPES = ['documents', 'patient-files', 'visit-files', 'lab-result-files', 'display-ads'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * Stands in for the clinic in the folder of a file whose clinic is unknown (only possible for
 * very old patient attachments). Subdomains can't contain "_", so it can't be a real clinic's.
 */
export const NO_CLINIC_SLUG = 'no_clinic';

/** The folder that holds everything of one clinic, without a trailing slash. */
export function tenantFolder(tenantSlug: string): string {
  return `${CLOUDINARY_ROOT_FOLDER}/${safeFolderSegment(tenantSlug, NO_CLINIC_SLUG)}`;
}

/** The folder for one kind of file of one clinic. */
export function assetFolder(tenantSlug: string, type: AssetType): string {
  return `${tenantFolder(tenantSlug)}/${type}`;
}

/** The tag every asset of a clinic carries. */
export function tenantTag(tenantId: string): string {
  return `tenant_${safeFolderSegment(tenantId, 'unknown')}`;
}

/** Who a file belongs to: the clinic's id (for the tag) and subdomain (for the folder). */
export interface AssetOwner {
  tenantId: string;
  tenantSlug: string;
}

/** Folder and tags for a new upload of a clinic, plus any extra tags. */
export function ownedUploadOptions(owner: AssetOwner, type: AssetType, extraTags: string[] = []): { folder: string; tags: string[] } {
  const tags = extraTags.map((t) => safeFolderSegment(t, '')).filter(Boolean).slice(0, 20);
  return { folder: assetFolder(owner.tenantSlug, type), tags: [tenantTag(owner.tenantId), type, ...tags] };
}

/**
 * Upload a clinic document as an authenticated (non-public) asset into the clinic's documents
 * folder. The category and the staff's own tags go on as tags, not folders.
 */
export async function uploadDocumentToCloudinary(
  file: File,
  category: string,
  owner: AssetOwner,
  options: UploadOptions = {}
): Promise<{ success: boolean; data?: UploadResult; error?: string }> {
  return uploadToCloudinary(file, {
    ...options,
    deliveryType: options.deliveryType || 'authenticated',
    ...ownedUploadOptions(owner, 'documents', [safeFolderSegment(category), ...(options.tags || [])]),
  });
}

export interface CloudinaryAssetRef {
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
  deliveryType: 'authenticated' | 'private' | 'upload';
  format?: string;
}

/**
 * Parse a stored Cloudinary delivery URL into an asset reference. Only URLs on this
 * account's cloud are accepted, so a tampered `url` can't point the server elsewhere.
 */
export function parseCloudinaryUrl(url: string | undefined | null): CloudinaryAssetRef | null {
  if (!url || !process.env.CLOUDINARY_CLOUD_NAME) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.hostname !== 'res.cloudinary.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  // /{cloud}/{resource_type}/{type}/[s--sig--/][v123/]{public_id}.{format}
  if (parts.length < 4 || parts[0] !== process.env.CLOUDINARY_CLOUD_NAME) return null;
  const resourceType = parts[1] as CloudinaryAssetRef['resourceType'];
  const deliveryType = parts[2] as CloudinaryAssetRef['deliveryType'];
  if (!['image', 'video', 'raw'].includes(resourceType)) return null;
  if (!['authenticated', 'private', 'upload'].includes(deliveryType)) return null;
  let rest = parts.slice(3);
  if (rest[0]?.startsWith('s--')) rest = rest.slice(1);
  if (/^v\d+$/.test(rest[0] || '')) rest = rest.slice(1);
  const path = decodeURIComponent(rest.join('/'));
  if (!path) return null;
  if (resourceType === 'raw') return { publicId: path, resourceType, deliveryType };
  const dot = path.lastIndexOf('.');
  return dot > 0
    ? { publicId: path.slice(0, dot), resourceType, deliveryType, format: path.slice(dot + 1) }
    : { publicId: path, resourceType, deliveryType };
}

/**
 * The ad image as an asset of this account in the clinic's ad folder (the one public kind of
 * upload), or null when it is anything else.
 */
export function ownAdImageRef(url: string | undefined | null, tenantSlug: string): CloudinaryAssetRef | null {
  const ref = parseCloudinaryUrl(url);
  if (!ref || ref.resourceType !== 'image' || ref.deliveryType !== 'upload') return null;
  return ref.publicId.startsWith(`${assetFolder(tenantSlug, 'display-ads')}/`) ? ref : null;
}

const RESOURCE_TYPES: ReadonlyArray<CloudinaryAssetRef['resourceType']> = ['image', 'video', 'raw'];
const DELIVERY_TYPES: ReadonlyArray<CloudinaryAssetRef['deliveryType']> = ['authenticated', 'private', 'upload'];

/**
 * Resolve the asset a stored record points at, from its metadata (cloudinaryPublicId /
 * cloudinaryResourceType / cloudinaryDeliveryType / cloudinaryFormat) with the stored URL as
 * a fallback. Records written before metadata carried a delivery type are legacy public
 * ('upload') assets; migrated ones say 'authenticated'.
 */
export function cloudinaryRefFromStored(url: string | undefined | null, metadata: any): CloudinaryAssetRef | null {
  const fromUrl = parseCloudinaryUrl(url);
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  if (typeof meta.cloudinaryPublicId !== 'string' || !meta.cloudinaryPublicId) return fromUrl;
  const resourceType = RESOURCE_TYPES.includes(meta.cloudinaryResourceType) ? meta.cloudinaryResourceType : undefined;
  const deliveryType = DELIVERY_TYPES.includes(meta.cloudinaryDeliveryType) ? meta.cloudinaryDeliveryType : undefined;
  const format = typeof meta.cloudinaryFormat === 'string' && meta.cloudinaryFormat ? meta.cloudinaryFormat : undefined;
  // The URL only describes this asset if it carries the same public id.
  const sameAsset = fromUrl && fromUrl.publicId === meta.cloudinaryPublicId ? fromUrl : null;
  return {
    publicId: meta.cloudinaryPublicId,
    resourceType: resourceType || sameAsset?.resourceType || 'image',
    deliveryType: deliveryType || sameAsset?.deliveryType || 'upload',
    format: format || sameAsset?.format,
  };
}

/**
 * Short-lived signed download URL (default 5 minutes) through Cloudinary's API download
 * endpoint. Works for authenticated, private and legacy public ('upload') assets.
 */
export function getPrivateDownloadUrl(ref: CloudinaryAssetRef, expiresInSeconds = 300): string {
  if (!isCloudinaryConfigured()) return '';
  return cloudinary.utils.private_download_url(ref.publicId, ref.format || '', {
    resource_type: ref.resourceType,
    type: ref.deliveryType,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  });
}

/**
 * Open a stored asset for the app to pass on to the browser. The body is streamed through
 * as it arrives rather than read into memory first, so the browser never sees a Cloudinary
 * URL and a large file doesn't sit whole in the function. `size` is only given when the
 * byte count is known to match what is streamed (no transfer encoding in between).
 */
export async function openCloudinaryAsset(
  ref: CloudinaryAssetRef
): Promise<{ body: ReadableStream<Uint8Array>; contentType: string; size?: number } | null> {
  const signedUrl = getPrivateDownloadUrl(ref, 120);
  if (!signedUrl) return null;
  try {
    const res = await fetch(signedUrl, { redirect: 'follow', signal: AbortSignal.timeout(CLOUDINARY_TIMEOUT_MS) });
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const length = Number(res.headers.get('content-length'));
    const size = !res.headers.get('content-encoding') && Number.isFinite(length) && length > 0 ? length : undefined;
    return { body: res.body, contentType: res.headers.get('content-type') || 'application/octet-stream', size };
  } catch (error) {
    console.error('Error fetching Cloudinary asset:', error);
    return null;
  }
}

/**
 * Delete file from Cloudinary. An asset that is already gone counts as deleted: the goal
 * (the file no longer exists) is met, and retries of an earlier removal must not fail.
 */
export async function deleteFromCloudinary(
  publicId: string,
  opts: { resourceType?: string; deliveryType?: string } = {}
): Promise<{ success: boolean; alreadyGone?: boolean; error?: string }> {
  if (!isCloudinaryConfigured()) {
    return {
      success: false,
      error: 'Cloudinary is not configured',
    };
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      ...(opts.resourceType ? { resource_type: opts.resourceType } : {}),
      ...(opts.deliveryType ? { type: opts.deliveryType } : {}),
      invalidate: true,
    });

    if (result.result === 'ok') return { success: true };
    if (result.result === 'not found') return { success: true, alreadyGone: true };
    console.error(`Cloudinary did not delete ${publicId}: ${result.result}`);
    return { success: false, error: result.result || 'Failed to delete from Cloudinary' };
  } catch (error: any) {
    console.error('Error deleting from Cloudinary:', error);
    return {
      success: false,
      error: 'Failed to delete from Cloudinary',
    };
  }
}

/**
 * Delete every asset under a folder prefix (`{ prefix }`, one delivery type) or carrying a tag
 * (`{ tag }`). Cloudinary removes at most 1000 per call and says when more are left (a cursor,
 * or `partial`), so this keeps calling until none is.
 */
export async function deleteCloudinaryAssets(
  match: { prefix: string; deliveryType: 'authenticated' | 'private' | 'upload' } | { tag: string },
  resourceType: 'image' | 'video' | 'raw'
): Promise<{ deleted: number; error?: string }> {
  if (!isCloudinaryConfigured()) return { deleted: 0, error: 'Cloudinary is not configured' };
  // Never a bare root or clinic-less prefix: that would empty more than one clinic.
  if ('prefix' in match && match.prefix.split('/').filter(Boolean).length < 2) {
    return { deleted: 0, error: `refusing to delete by the broad prefix "${match.prefix}"` };
  }
  let deleted = 0;
  let cursor: string | undefined;
  try {
    // A safety stop well past any real folder (1000 per round).
    for (let round = 0; round < 1000; round++) {
      const opts = { resource_type: resourceType, invalidate: true, ...(cursor ? { next_cursor: cursor } : {}) };
      const res =
        'prefix' in match
          ? await cloudinary.api.delete_resources_by_prefix(match.prefix, { ...opts, type: match.deliveryType })
          : await cloudinary.api.delete_resources_by_tag(match.tag, opts);
      const removedNow = Object.values(res.deleted ?? {}).filter((v) => v === 'deleted').length;
      deleted += removedNow;
      cursor = res.next_cursor;
      // `partial` without a cursor: the next call starts over on what is left.
      if (!cursor && !(res.partial && removedNow > 0)) return { deleted };
    }
    return { deleted, error: 'stopped after 1000 rounds; run again' };
  } catch (error: any) {
    return { deleted, error: error?.error?.message ?? error?.message ?? 'failed' };
  }
}

/**
 * Check if Cloudinary is configured
 */
export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}
