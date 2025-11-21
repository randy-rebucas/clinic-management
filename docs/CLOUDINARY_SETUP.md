# Cloudinary Setup Guide

This guide explains how to set up Cloudinary for file storage in the clinic management system.

## Overview

Cloudinary is used for storing and managing documents (PDFs, images, etc.) instead of storing them as base64 in MongoDB. This provides:
- Better performance
- Automatic image optimization
- Thumbnail generation
- CDN delivery
- Better scalability

## Prerequisites

1. A Cloudinary account (sign up at [cloudinary.com](https://cloudinary.com))
2. Cloudinary credentials from your dashboard

## Setup Steps

### 1. Install Cloudinary Package

The Cloudinary package is already included in the project. If you need to reinstall:

```bash
npm install cloudinary
```

### 2. Get Cloudinary Credentials

1. Log in to your [Cloudinary Console](https://console.cloudinary.com)
2. Navigate to Dashboard
3. Copy your credentials:
   - **Cloud Name** (e.g., `your-cloud-name`)
   - **API Key** (e.g., `123456789012345`)
   - **API Secret** (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

### 3. Configure Environment Variables

Add the following to your `.env.local` file:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 4. Restart Your Server

After adding the environment variables, restart your Next.js development server:

```bash
npm run dev
```

## Features

Once configured, Cloudinary will automatically:

- **Upload Documents**: All document uploads go to Cloudinary
- **Organize Files**: Files are organized by category and patient in folders
- **Generate Thumbnails**: Automatic thumbnail generation for images
- **Optimize Images**: Automatic image optimization and format conversion
- **CDN Delivery**: Fast global CDN delivery
- **Secure URLs**: HTTPS URLs for all files

## Folder Structure

Documents are organized in Cloudinary with the following folder structure:

```
clinic-documents/
  ├── referral/
  │   └── patient-{patientId}/
  ├── laboratory_result/
  │   └── patient-{patientId}/
  ├── imaging/
  │   └── patient-{patientId}/
  ├── medical_certificate/
  │   └── patient-{patientId}/
  └── ...
```

## Fallback Behavior

If Cloudinary is not configured, the system will:
- Fall back to base64 storage in MongoDB
- Continue to work normally (for development)
- Log warnings about Cloudinary not being configured

## API Usage

The document upload API automatically uses Cloudinary when configured:

```javascript
// Upload document
const formData = new FormData();
formData.append('file', file);
formData.append('category', 'imaging');
formData.append('patientId', patientId);

const response = await fetch('/api/documents', {
  method: 'POST',
  body: formData,
});
```

The response will include:
- `url`: Cloudinary secure URL
- `thumbnailUrl`: Thumbnail URL (for images)
- `metadata.cloudinaryPublicId`: Public ID for future operations

## Cloudinary Utilities

The system provides utility functions in `lib/cloudinary.ts`:

- `uploadToCloudinary()` - Upload file to Cloudinary
- `uploadDocumentToCloudinary()` - Upload with automatic folder organization
- `getThumbnailUrl()` - Generate thumbnail URL
- `getOptimizedImageUrl()` - Get optimized image URL
- `deleteFromCloudinary()` - Delete file from Cloudinary
- `extractPublicIdFromUrl()` - Extract public ID from URL
- `isCloudinaryConfigured()` - Check if Cloudinary is configured

## Image Transformations

Cloudinary supports automatic image transformations:

- **Thumbnails**: Automatic thumbnail generation
- **Optimization**: Automatic format and quality optimization
- **Resizing**: Automatic resizing based on device
- **Format Conversion**: Automatic format conversion (WebP, AVIF, etc.)

## Security

- All URLs use HTTPS
- Files are organized by patient for access control
- Public IDs are stored in document metadata for management
- Soft delete removes from Cloudinary when document is deleted

## Troubleshooting

### Files Not Uploading

1. **Check Environment Variables**: Ensure all three Cloudinary variables are set
2. **Verify Credentials**: Check that credentials are correct in Cloudinary console
3. **Check File Size**: Cloudinary free tier has limits (10MB for images, 100MB for videos)
4. **Check Network**: Ensure server can reach Cloudinary API

### Files Not Displaying

1. **Check URL Format**: Cloudinary URLs should start with `https://res.cloudinary.com`
2. **Check CORS**: Cloudinary handles CORS automatically
3. **Check File Format**: Ensure file format is supported by Cloudinary

### Thumbnails Not Generating

1. **Check File Type**: Thumbnails only generate for images
2. **Check Public ID**: Ensure public ID is stored in document metadata
3. **Check Transformation**: Verify thumbnail transformation parameters

## Production Recommendations

1. **Upgrade Plan**: Consider upgrading Cloudinary plan for production
2. **Backup Strategy**: Implement backup strategy for critical documents
3. **Access Control**: Use Cloudinary's access control features
4. **Monitoring**: Monitor Cloudinary usage and costs
5. **CDN**: Cloudinary provides global CDN automatically

## Cost Considerations

Cloudinary offers:
- **Free Tier**: 25GB storage, 25GB bandwidth/month
- **Paid Plans**: Based on storage and bandwidth usage

For production, consider:
- Storage optimization
- Bandwidth optimization
- Image optimization to reduce bandwidth
- Caching strategies

## Migration from Base64

If you have existing documents stored as base64:

1. Documents will continue to work (fallback mode)
2. New uploads will use Cloudinary
3. You can migrate existing documents by re-uploading them
4. Or create a migration script to upload existing base64 files to Cloudinary

