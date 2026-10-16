// Cloudinary configuration and utilities
// Set environment variables: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true, // Use HTTPS
  });
}

export interface UploadOptions {
  folder?: string; // Folder path in Cloudinary
  publicId?: string; // Custom public ID
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  /**
   * Delivery type. Defaults to 'authenticated': the asset is not reachable by a public URL
   * and must be fetched with a short-lived signed URL (see getPrivateDownloadUrl).
   */
  deliveryType?: 'authenticated' | 'private' | 'upload';
  contentType?: string; // MIME type of the file, for the data URI
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
 * Upload file to Cloudinary
 */
export async function uploadToCloudinary(
  file: File | Buffer,
  options: UploadOptions = {}
): Promise<{ success: boolean; data?: UploadResult; error?: string }> {
  // Check if Cloudinary is configured
  if (!isCloudinaryConfigured()) {
    return {
      success: false,
      error: 'Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.',
    };
  }

  try {
    // Convert File to buffer if needed
    let buffer: Buffer;
    if (file instanceof File) {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      buffer = file;
    }

    // Convert buffer to base64
    const base64 = buffer.toString('base64');
    const mime = options.contentType || (file instanceof File ? file.type : '') || 'application/octet-stream';
    const dataUri = `data:${mime};base64,${base64}`;

    // Upload options
    const uploadOptions: any = {
      folder: options.folder || 'clinic-documents',
      resource_type: options.resourceType || 'auto',
      type: options.deliveryType || 'authenticated',
      tags: options.tags || [],
      context: options.context || {},
    };

    if (options.publicId) {
      uploadOptions.public_id = options.publicId;
    }

    if (options.format) {
      uploadOptions.format = options.format;
    }

    if (options.transformation) {
      uploadOptions.transformation = options.transformation;
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(dataUri, uploadOptions);

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
        type: (result as any).type || uploadOptions.type,
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

/**
 * Upload a clinic document as an authenticated (non-public) asset, organised by
 * tenant and category. Patient identifiers are deliberately kept out of folder names
 * and tags, which are visible in asset URLs and the Cloudinary console.
 */
export async function uploadDocumentToCloudinary(
  file: File,
  category: string,
  tenantId?: string,
  options: UploadOptions = {}
): Promise<{ success: boolean; data?: UploadResult; error?: string }> {
  const safeCategory = safeFolderSegment(category);
  const folderParts = ['clinic-documents'];
  if (tenantId) folderParts.push(safeFolderSegment(tenantId, 'tenant'));
  folderParts.push(safeCategory);

  const tags = (options.tags || []).map((t) => safeFolderSegment(t, '')).filter(Boolean).slice(0, 20);
  tags.push(safeCategory);

  return uploadToCloudinary(file, {
    ...options,
    deliveryType: options.deliveryType || 'authenticated',
    folder: folderParts.join('/'),
    tags,
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
 * Fetch a stored asset's bytes server-side, so files are proxied through the app with
 * its own headers instead of redirecting the browser to a long-lived public URL.
 */
export async function fetchCloudinaryAsset(ref: CloudinaryAssetRef): Promise<{ buffer: Buffer; contentType: string } | null> {
  const signedUrl = getPrivateDownloadUrl(ref, 120);
  if (!signedUrl) return null;
  try {
    const res = await fetch(signedUrl, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
    };
  } catch (error) {
    console.error('Error fetching Cloudinary asset:', error);
    return null;
  }
}

/**
 * Generate thumbnail URL from Cloudinary
 */
export function getThumbnailUrl(publicId: string, width: number = 300, height?: number): string {
  if (!isCloudinaryConfigured()) {
    return '';
  }

  const transformation: any = {
    width,
    height: height || width,
    crop: 'fill',
    quality: 'auto',
    format: 'auto',
  };

  return cloudinary.url(publicId, {
    transformation: [transformation],
    secure: true,
  });
}

/**
 * Generate optimized image URL
 */
export function getOptimizedImageUrl(
  publicId: string,
  width?: number,
  height?: number,
  quality: string = 'auto',
  format?: string
): string {
  if (!isCloudinaryConfigured()) {
    return '';
  }

  const transformation: any = {
    quality,
    format: format || 'auto',
  };

  if (width) transformation.width = width;
  if (height) transformation.height = height;

  return cloudinary.url(publicId, {
    transformation: [transformation],
    secure: true,
  });
}

/**
 * Delete file from Cloudinary
 */
export async function deleteFromCloudinary(
  publicId: string,
  opts: { resourceType?: string; deliveryType?: string } = {}
): Promise<{ success: boolean; error?: string }> {
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
    });
    
    if (result.result === 'ok') {
      return { success: true };
    } else {
      return {
        success: false,
        error: result.result || 'Failed to delete from Cloudinary',
      };
    }
  } catch (error: any) {
    console.error('Error deleting from Cloudinary:', error);
    return {
      success: false,
      error: 'Failed to delete from Cloudinary',
    };
  }
}

/**
 * Extract public ID from Cloudinary URL
 */
export function extractPublicIdFromUrl(url: string): string | null {
  try {
    const ref = parseCloudinaryUrl(url);
    if (ref) return ref.publicId;
    // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{version}/{public_id}.{format}
    const match = url.match(/\/(?:upload|authenticated|private)\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  } catch (error) {
    return null;
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

/**
 * Get a file URL (for download/view). Signed and short-lived; prefer
 * fetchCloudinaryAsset so the browser never receives a Cloudinary URL at all.
 */
export function getCloudinaryFileUrl(
  publicId: string,
  format?: string,
  opts: { resourceType?: CloudinaryAssetRef['resourceType']; deliveryType?: CloudinaryAssetRef['deliveryType'] } = {}
): string {
  if (!isCloudinaryConfigured()) {
    return '';
  }
  return getPrivateDownloadUrl({
    publicId,
    format,
    resourceType: opts.resourceType || 'image',
    deliveryType: opts.deliveryType || 'authenticated',
  });
}

