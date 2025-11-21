// Document utility functions for file processing, OCR, and categorization

/**
 * Determine document type from file extension or MIME type
 */
export function getDocumentType(filename: string, contentType?: string): 'pdf' | 'image' | 'word' | 'excel' | 'other' {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  
  // Check by extension first
  if (['pdf'].includes(extension)) return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff'].includes(extension)) return 'image';
  if (['doc', 'docx'].includes(extension)) return 'word';
  if (['xls', 'xlsx'].includes(extension)) return 'excel';
  
  // Check by MIME type if extension doesn't match
  if (contentType) {
    if (contentType.includes('pdf')) return 'pdf';
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.includes('word') || contentType.includes('document')) return 'word';
    if (contentType.includes('excel') || contentType.includes('spreadsheet')) return 'excel';
  }
  
  return 'other';
}

/**
 * Determine document category from filename, content, or explicit category
 */
export function inferDocumentCategory(
  filename: string,
  explicitCategory?: string,
  metadata?: { [key: string]: any }
): 'referral' | 'laboratory_result' | 'imaging' | 'medical_certificate' | 'prescription' | 'invoice' | 'id' | 'insurance' | 'other' {
  if (explicitCategory) {
    return explicitCategory as any;
  }
  
  const lowerFilename = filename.toLowerCase();
  
  // Check filename for keywords
  if (lowerFilename.includes('referral') || lowerFilename.includes('refer')) {
    return 'referral';
  }
  if (lowerFilename.includes('lab') || lowerFilename.includes('laboratory') || lowerFilename.includes('test')) {
    return 'laboratory_result';
  }
  if (lowerFilename.includes('xray') || lowerFilename.includes('x-ray') || 
      lowerFilename.includes('ct') || lowerFilename.includes('mri') || 
      lowerFilename.includes('ultrasound') || lowerFilename.includes('scan') ||
      lowerFilename.includes('imaging')) {
    return 'imaging';
  }
  if (lowerFilename.includes('certificate') || lowerFilename.includes('cert') || 
      lowerFilename.includes('medical cert')) {
    return 'medical_certificate';
  }
  if (lowerFilename.includes('prescription') || lowerFilename.includes('rx')) {
    return 'prescription';
  }
  if (lowerFilename.includes('invoice') || lowerFilename.includes('bill') || 
      lowerFilename.includes('receipt')) {
    return 'invoice';
  }
  if (lowerFilename.includes('id') || lowerFilename.includes('identification')) {
    return 'id';
  }
  if (lowerFilename.includes('insurance') || lowerFilename.includes('hmo') || 
      lowerFilename.includes('philhealth')) {
    return 'insurance';
  }
  
  // Check metadata if provided
  if (metadata) {
    if (metadata.category) return metadata.category as any;
  }
  
  return 'other';
}

/**
 * Generate thumbnail for images (placeholder - in production, use image processing library)
 */
export async function generateThumbnail(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) {
    return null;
  }
  
  try {
    // In production, use a library like sharp or jimp to generate thumbnails
    // For now, return null (thumbnail generation would be done server-side)
    return null;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return null;
  }
}

/**
 * Extract text from PDF or image using OCR (placeholder)
 * In production, use libraries like:
 * - pdf-parse for PDF text extraction
 * - tesseract.js or Google Cloud Vision API for OCR
 */
export async function extractTextFromDocument(file: File): Promise<string | null> {
  try {
    // Placeholder for OCR/text extraction
    // In production, implement:
    // 1. For PDFs: Use pdf-parse or pdf.js
    // 2. For images: Use Tesseract.js or cloud OCR service
    
    if (file.type === 'application/pdf') {
      // PDF text extraction would go here
      return null;
    }
    
    if (file.type.startsWith('image/')) {
      // OCR would go here
      return null;
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting text:', error);
    return null;
  }
}

/**
 * Validate file for upload
 */
export function validateFile(file: File, maxSizeMB: number = 10): { valid: boolean; error?: string } {
  // Check file size
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${maxSizeMB}MB`,
    };
  }
  
  // Check file type (allow common document and image types)
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed`,
    };
  }
  
  return { valid: true };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

