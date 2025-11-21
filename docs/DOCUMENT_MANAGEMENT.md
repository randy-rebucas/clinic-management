# Document Management System

This document describes the Document Management features implemented in the clinic management system.

## Features Overview

### 1. Upload and Categorize Documents

The system supports uploading and categorizing various types of medical documents.

**Document Categories:**
- **Referral** - Referral letters from other doctors/clinics
- **Laboratory Result** - Lab test results and reports
- **Imaging** - X-rays, CT scans, MRI, Ultrasound, etc.
- **Medical Certificate** - Medical certificates for work, school, travel, etc.
- **Prescription** - Prescription documents
- **Invoice** - Billing and invoice documents
- **ID** - Identification documents
- **Insurance** - Insurance and HMO documents
- **Other** - Miscellaneous documents

**Document Types:**
- **PDF** - PDF documents
- **Image** - Image files (JPG, PNG, GIF, etc.)
- **Word** - Microsoft Word documents
- **Excel** - Microsoft Excel spreadsheets
- **Other** - Other file types

### 2. Document Model

The Document model includes:

```typescript
{
  documentCode: string,           // Unique identifier
  title: string,
  description: string,
  category: DocumentCategory,
  documentType: DocumentType,
  filename: string,
  originalFilename: string,
  contentType: string,
  size: number,
  url: string,                    // Base64 data URL or external URL
  thumbnailUrl: string,           // For images/PDFs
  patient: ObjectId,              // Associated patient
  visit: ObjectId,                // Associated visit
  appointment: ObjectId,           // Associated appointment
  labResult: ObjectId,            // Associated lab result
  invoice: ObjectId,              // Associated invoice
  tags: string[],                 // For search and filtering
  scanned: boolean,              // Whether document was scanned
  ocrText: string,                // OCR extracted text
  expiryDate: Date,               // For documents with expiry
  referral: {                     // Referral-specific data
    referringDoctor: string,
    referringClinic: string,
    referralDate: Date,
    reason: string
  },
  imaging: {                      // Imaging-specific data
    modality: string,             // X-ray, CT, MRI, etc.
    bodyPart: string,
    studyDate: Date,
    radiologist: string
  },
  medicalCertificate: {           // Medical certificate data
    issueDate: Date,
    validUntil: Date,
    purpose: string,
    restrictions: string
  },
  labResult: {                    // Lab result data
    testType: string,
    testDate: Date,
    labName: string
  },
  uploadedBy: ObjectId,
  uploadDate: Date,
  lastModifiedBy: ObjectId,
  lastModifiedDate: Date,
  status: 'active' | 'archived' | 'deleted',
  isConfidential: boolean,
  notes: string
}
```

### 3. PDF and Image Scanning

The system supports:
- **PDF Upload** - Upload and store PDF documents
- **Image Upload** - Upload and store image files
- **OCR (Optical Character Recognition)** - Extract text from scanned documents
- **Text Extraction** - Extract text from PDFs and images for search

**Note:** OCR functionality is implemented as a placeholder. In production, integrate with:
- **PDF Text Extraction**: pdf-parse, pdf.js
- **Image OCR**: Tesseract.js, Google Cloud Vision API, AWS Textract

### 4. Document Management API

**Endpoints:**

#### List Documents
- `GET /api/documents`
  - Query params: `patientId`, `category`, `documentType`, `status`, `search`, `visitId`, `limit`
  - Returns: List of documents with pagination

#### Create Document
- `POST /api/documents`
  - FormData with:
    - `file` - File to upload
    - `category` - Document category
    - `patientId` - Associated patient ID
    - `visitId` - Associated visit ID (optional)
    - `title` - Document title
    - `description` - Document description
    - `tags` - Comma-separated tags
    - `notes` - Additional notes
    - `scanned` - Whether document is scanned
    - Category-specific data (JSON):
      - `referralData` - For referrals
      - `imagingData` - For imaging files
      - `medicalCertificateData` - For medical certificates
      - `labResultData` - For lab results

#### Get Document
- `GET /api/documents/[id]`
  - Returns: Document details with populated relationships

#### Update Document
- `PUT /api/documents/[id]`
  - Body: JSON with fields to update
  - Updates lastModifiedBy and lastModifiedDate automatically

#### Delete Document
- `DELETE /api/documents/[id]`
  - Soft delete (sets status to 'deleted')

#### Download Document
- `GET /api/documents/[id]/download`
  - Returns: File download with appropriate headers

#### View Document
- `GET /api/documents/[id]/view`
  - Returns: HTML page with embedded document viewer
  - Supports PDF and image preview

#### Scan Document
- `POST /api/documents/scan`
  - FormData with:
    - `file` - File to scan
    - `documentId` - Optional document ID to update
  - Returns: OCR extracted text

## Usage Examples

### Upload a Referral Document

```javascript
const formData = new FormData();
formData.append('file', file);
formData.append('category', 'referral');
formData.append('patientId', patientId);
formData.append('title', 'Referral from Dr. Smith');
formData.append('referralData', JSON.stringify({
  referringDoctor: 'Dr. John Smith',
  referringClinic: 'City Hospital',
  referralDate: '2024-01-15',
  reason: 'Cardiology consultation'
}));

const response = await fetch('/api/documents', {
  method: 'POST',
  body: formData,
});
```

### Upload an Imaging File

```javascript
const formData = new FormData();
formData.append('file', file);
formData.append('category', 'imaging');
formData.append('patientId', patientId);
formData.append('visitId', visitId);
formData.append('title', 'Chest X-Ray');
formData.append('imagingData', JSON.stringify({
  modality: 'X-ray',
  bodyPart: 'Chest',
  studyDate: '2024-01-15',
  radiologist: 'Dr. Jane Doe'
}));

const response = await fetch('/api/documents', {
  method: 'POST',
  body: formData,
});
```

### Upload a Medical Certificate

```javascript
const formData = new FormData();
formData.append('file', file);
formData.append('category', 'medical_certificate');
formData.append('patientId', patientId);
formData.append('title', 'Medical Certificate - Work');
formData.append('medicalCertificateData', JSON.stringify({
  issueDate: '2024-01-15',
  validUntil: '2024-01-22',
  purpose: 'Work',
  restrictions: 'No heavy lifting for 1 week'
}));

const response = await fetch('/api/documents', {
  method: 'POST',
  body: formData,
});
```

### Upload a Laboratory Result

```javascript
const formData = new FormData();
formData.append('file', file);
formData.append('category', 'laboratory_result');
formData.append('patientId', patientId);
formData.append('labResultData', JSON.stringify({
  testType: 'Complete Blood Count',
  testDate: '2024-01-15',
  labName: 'City Lab'
}));

const response = await fetch('/api/documents', {
  method: 'POST',
  body: formData,
});
```

### Search Documents

```javascript
// Search by patient and category
const response = await fetch('/api/documents?patientId=123&category=imaging');

// Full-text search
const response = await fetch('/api/documents?search=chest xray');

// Filter by document type
const response = await fetch('/api/documents?documentType=pdf&category=referral');
```

### Scan Document for OCR

```javascript
const formData = new FormData();
formData.append('file', scannedFile);
formData.append('documentId', documentId); // Optional

const response = await fetch('/api/documents/scan', {
  method: 'POST',
  body: formData,
});

const data = await response.json();
console.log('OCR Text:', data.data.ocrText);
```

## Document Categories and Metadata

### Referral Documents
- **referringDoctor** - Name of referring doctor
- **referringClinic** - Name of referring clinic
- **referralDate** - Date of referral
- **reason** - Reason for referral

### Imaging Files
- **modality** - Type of imaging (X-ray, CT, MRI, Ultrasound, etc.)
- **bodyPart** - Body part imaged
- **studyDate** - Date of study
- **radiologist** - Radiologist who reviewed

### Medical Certificates
- **issueDate** - Date certificate was issued
- **validUntil** - Expiry date
- **purpose** - Purpose (Work, School, Travel, etc.)
- **restrictions** - Any restrictions or limitations

### Laboratory Results
- **testType** - Type of test
- **testDate** - Date test was performed
- **labName** - Name of laboratory

## File Storage

**Current Implementation:**
- Files are stored as base64 data URLs in MongoDB
- Suitable for development and small files

**Production Recommendations:**
- Use external storage (AWS S3, Google Cloud Storage, Azure Blob Storage)
- Use CDN for file delivery
- Implement file size limits
- Generate thumbnails for images
- Use GridFS for large files in MongoDB

## Security Features

- **Access Control**: Users can only access documents for patients they have permission to view
- **Confidential Documents**: Mark documents as confidential
- **Soft Delete**: Documents are soft-deleted (status: 'deleted') rather than permanently removed
- **Audit Trail**: Track who uploaded and modified documents
- **File Validation**: Validate file types and sizes before upload

## Search and Filtering

- **Full-text Search**: Search by title, description, and OCR text
- **Category Filter**: Filter by document category
- **Type Filter**: Filter by document type (PDF, image, etc.)
- **Patient Filter**: Filter by associated patient
- **Visit Filter**: Filter by associated visit
- **Tag Filter**: Filter by tags
- **Status Filter**: Filter by status (active, archived, deleted)

## Future Enhancements

- **OCR Integration**: Implement actual OCR using Tesseract.js or cloud services
- **PDF Text Extraction**: Extract text from PDFs for search
- **Thumbnail Generation**: Generate thumbnails for images and PDFs
- **External Storage**: Integrate with S3, Cloudinary, or similar
- **Version Control**: Track document versions
- **Document Templates**: Pre-filled templates for common documents
- **Digital Signatures**: Add digital signature support
- **Document Sharing**: Share documents with external parties
- **Bulk Upload**: Upload multiple documents at once
- **Document Workflow**: Approval workflows for sensitive documents
- **Expiry Alerts**: Notify when documents are expiring
- **Document Analytics**: Track document access and usage

