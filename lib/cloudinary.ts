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
    const dataUri = `data:${options.resourceType || 'auto'};base64,${base64}`;

    // Upload options
    const uploadOptions: any = {
      folder: options.folder || 'clinic-documents',
      resource_type: options.resourceType || 'auto',
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
        created_at: result.created_at,
      },
    };
  } catch (error: any) {
    console.error('Error uploading to Cloudinary:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload to Cloudinary',
    };
  }
}

/**
 * Upload file with automatic folder organization by category
 */
export async function uploadDocumentToCloudinary(
  file: File,
  category: string,
  patientId?: string,
  options: UploadOptions = {}
): Promise<{ success: boolean; data?: UploadResult; error?: string }> {
  // Build folder path
  const folderParts = ['clinic-documents', category];
  if (patientId) {
    folderParts.push(`patient-${patientId}`);
  }
  const folder = folderParts.join('/');

  // Add category tag
  const tags = options.tags || [];
  tags.push(category);
  if (patientId) {
    tags.push(`patient-${patientId}`);
  }

  return uploadToCloudinary(file, {
    ...options,
    folder,
    tags,
  });
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
export async function deleteFromCloudinary(publicId: string): Promise<{ success: boolean; error?: string }> {
  if (!isCloudinaryConfigured()) {
    return {
      success: false,
      error: 'Cloudinary is not configured',
    };
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    
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
      error: error.message || 'Failed to delete from Cloudinary',
    };
  }
}

/**
 * Extract public ID from Cloudinary URL
 */
export function extractPublicIdFromUrl(url: string): string | null {
  try {
    // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{version}/{public_id}.{format}
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
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
 * Get file URL from Cloudinary (for download/view)
 */
export function getCloudinaryFileUrl(publicId: string, format?: string): string {
  if (!isCloudinaryConfigured()) {
    return '';
  }

  return cloudinary.url(publicId, {
    format,
    secure: true,
    resource_type: 'auto',
  });
}

