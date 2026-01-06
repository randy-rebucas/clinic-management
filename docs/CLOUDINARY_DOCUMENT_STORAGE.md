# Cloudinary Document Storage Setup

Complete guide to setting up Cloudinary for secure document and image storage in MyClinicSoft.

## Overview

MyClinicSoft uses Cloudinary for:
- Patient document storage
- Medical images
- Profile photos
- Medical certificates
- Lab results
- Consent forms
- General clinic documents

## What is Cloudinary?

Cloudinary is a cloud-based media management platform that provides:
- Secure file storage
- Image optimization
- File transformations
- CDN delivery
- Access control

## Prerequisites

Before starting, you'll need:
- A Cloudinary account (free tier available)
- Cloudinary credentials (Cloud Name, API Key, API Secret)
- MyClinicSoft installation

## Step-by-Step Setup

### Step 1: Create Cloudinary Account

1. Go to [https://cloudinary.com/users/register/free](https://cloudinary.com/users/register/free)
2. Sign up for a free account
3. Verify your email address
4. Complete account setup

**Free Tier Includes:**
- 25 GB storage
- 25 GB monthly bandwidth
- 25,000 transformations/month
- Basic features

**Sufficient for:**
- Small to medium clinics
- Up to ~10,000 documents
- Normal usage patterns

### Step 2: Get Cloudinary Credentials

1. Log in to Cloudinary Dashboard
2. On the dashboard home, find:
   - **Cloud Name** - Your unique identifier
   - **API Key** - Public key (like username)
   - **API Secret** - Private key (like password)
3. Click "Reveal" to see API Secret
4. Copy all three values

**Example:**
```
Cloud Name: your-clinic-name
API Key: 123456789012345
API Secret: AbCdEfGhIjKlMnOpQrStUvWxYz123
```

### Step 3: Configure MyClinicSoft

Add credentials to your `.env.local` file:

```env
CLOUDINARY_CLOUD_NAME=your-clinic-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=AbCdEfGhIjKlMnOpQrStUvWxYz123
```

**Security Note:** Never commit `.env.local` to version control!

### Step 4: Restart Application

```bash
# Stop the development server (Ctrl+C)
# Restart it
npm run dev
```

### Step 5: Test Upload

1. Log in to MyClinicSoft
2. Go to **Documents** or any patient record
3. Click **Upload Document**
4. Select a test file
5. Click **Upload**
6. Verify upload succeeds

**Check Cloudinary Dashboard:**
- File should appear in Media Library
- Note the upload folder structure

## Folder Structure

MyClinicSoft organizes uploads in Cloudinary:

```
myclinicsoft/
├── patients/
│   ├── {patientId}/
│   │   ├── documents/
│   │   ├── images/
│   │   └── profile/
├── documents/
│   ├── medical-certificates/
│   ├── consent-forms/
│   ├── lab-results/
│   └── general/
├── clinic/
│   ├── logos/
│   ├── staff-photos/
│   └── facility-images/
└── temp/
    └── uploads/
```

**Benefits:**
- Organized structure
- Easy to find files
- Clear separation by type
- Patient privacy maintained

## Upload Settings

### Allowed File Types

**Documents:**
- PDF (.pdf)
- Word (.doc, .docx)
- Excel (.xls, .xlsx)
- Text (.txt)

**Images:**
- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)

**Medical:**
- DICOM (.dcm) - for medical imaging
- HL7 - for lab results

### File Size Limits

**Default Limits:**
- Documents: 10 MB
- Images: 5 MB
- Profile photos: 2 MB

**Adjusting Limits:**
Configure in **Settings** → **Documents**:
- Max file size
- Allowed file types
- Compression settings

### Image Optimization

Cloudinary automatically:
- Optimizes image size
- Converts to efficient formats
- Creates responsive versions
- Applies compression

**Settings to Configure:**
1. Go to Cloudinary Dashboard
2. Settings → Upload
3. Configure:
   - Auto-optimize: Yes
   - Format: Auto
   - Quality: Auto
   - Progressive: Yes

## Access Control

### Secure URLs

MyClinicSoft uses signed URLs for security:

**Benefits:**
- Time-limited access
- Prevents unauthorized viewing
- Trackable downloads
- Revocable links

**How It Works:**
1. File uploaded to Cloudinary
2. Stored with private type
3. MyClinicSoft generates signed URL when needed
4. URL expires after set time (default: 1 hour)
5. After expiration, link stops working

### Private vs Public

**Private Files (Default):**
- Requires authentication
- Signed URLs only
- Cannot be guessed
- Secure for medical records

**Public Files:**
- Directly accessible
- No authentication needed
- Use for: logos, public documents
- Not for patient data

**Configure in MyClinicSoft:**
- Settings → Documents → Privacy
- Choose default visibility
- Set URL expiration time

## Document Management

### Uploading Documents

**From Patient Record:**
1. Open patient detail page
2. Go to **Documents** tab
3. Click **Upload Document**
4. Fill in:
   - Document type
   - Description
   - Tags
5. Select file
6. Click **Upload**

**From Documents Page:**
1. Go to **Documents**
2. Click **New Document**
3. Select patient (optional)
4. Upload file
5. Save

**Bulk Upload:**
1. Select multiple files
2. Auto-tag by folder/name
3. Batch upload
4. Review and confirm

### Viewing Documents

**View in Browser:**
- PDF, images: Direct preview
- Other files: Download prompt

**Download:**
1. Click on document
2. Click **Download**
3. File downloads to device

**Share:**
1. Click **Share**
2. Generate temporary link
3. Set expiration (1 hour, 24 hours, 7 days)
4. Copy link
5. Share with authorized person

### Organizing Documents

**Categories:**
- ID Cards
- Insurance Cards
- Medical Certificates
- Lab Results
- Imaging Results
- Consent Forms
- Prescriptions
- Other

**Tags:**
- Add custom tags
- Search by tags
- Filter by tags
- Auto-suggest common tags

**Search:**
- By patient name
- By document type
- By date range
- By tags
- By description

## Image Transformations

Cloudinary can transform images on-the-fly:

### Profile Photos

**Auto-resize and crop:**
```
https://res.cloudinary.com/{cloud_name}/image/upload/
c_fill,w_200,h_200,g_face/{folder}/{filename}
```

**Effects:**
- Center on face
- 200x200 pixels
- Consistent size

### Medical Images

**Enhance for clarity:**
```
https://res.cloudinary.com/{cloud_name}/image/upload/
e_sharpen:100,e_contrast:20/{folder}/{filename}
```

**Effects:**
- Sharpen details
- Increase contrast
- Better visibility

### Thumbnails

**Generate thumbnails:**
```
https://res.cloudinary.com/{cloud_name}/image/upload/
c_thumb,w_150,h_150/{folder}/{filename}
```

**Benefits:**
- Fast page loading
- Less bandwidth
- Better UX

## Backup and Recovery

### Cloudinary Backup

**Cloudinary Provides:**
- Automatic backups
- Redundant storage
- 99.99% uptime SLA
- Multiple data centers

**Your Responsibility:**
- Keep list of uploaded files
- Maintain metadata in database
- Regular database backups

### Local Backup

**Recommended:**
Create periodic backups of important documents:

1. Go to **Documents** → **Export**
2. Select documents to backup
3. Choose date range
4. Click **Download Backup**
5. Store securely offline

**Automated Backup:**
Configure in **Settings** → **Backups**:
- Enable auto-backup
- Set schedule (weekly/monthly)
- Select backup location
- Email notification on completion

### Recovery

**If File Lost from Database:**
1. File still exists in Cloudinary
2. View Cloudinary Media Library
3. Get public ID
4. Re-import to MyClinicSoft

**If Cloudinary Account Issue:**
- Contact Cloudinary support
- Files are replicated
- Recovery possible from backups

## Monitoring Usage

### Cloudinary Dashboard

Monitor in Cloudinary Dashboard:

**Metrics:**
- Storage used (GB)
- Bandwidth used (GB/month)
- Transformations used (count/month)
- Credits remaining

**Alerts:**
- Set up usage alerts
- Email when approaching limits
- Upgrade notification

### MyClinicSoft Reports

**Access:** **Reports** → **Documents**

**Reports:**
- Total documents stored
- Storage size by type
- Upload trends
- Most accessed documents
- Largest files

## Optimizing Costs

### Free Tier Optimization

**Tips to Stay Within Free Tier:**

1. **Optimize Before Upload**
   - Compress PDFs before uploading
   - Resize large images
   - Use appropriate quality settings

2. **Delete Unused Files**
   - Remove old temporary files
   - Archive old documents locally
   - Delete duplicate uploads

3. **Use Transformations Wisely**
   - Cache transformed versions
   - Use same transformations repeatedly
   - Avoid unique transformations

4. **Monitor Usage**
   - Check monthly usage
   - Project future needs
   - Plan ahead for scaling

### When to Upgrade

Consider paid plan if:
- Approaching free tier limits
- Need more storage (>25 GB)
- High bandwidth usage
- Need advanced features
- Want premium support

**Cloudinary Plans:**
- **Free**: $0/month, 25 GB storage
- **Plus**: $89/month, 75 GB storage
- **Advanced**: Custom pricing, unlimited

## Security Best Practices

1. **Protect API Secret**
   - Never expose in client code
   - Store in environment variables
   - Rotate periodically

2. **Use Signed URLs**
   - Enable for all private files
   - Set appropriate expiration
   - Revoke if needed

3. **Access Control**
   - Limit who can upload
   - Audit upload activity
   - Monitor suspicious access

4. **Encryption**
   - Cloudinary encrypts at rest
   - HTTPS for all transfers
   - Secure connections only

5. **Compliance**
   - HIPAA-compliant with Business Associate Agreement
   - GDPR-compliant
   - PH DPA-compliant

## Troubleshooting

### Upload Failing

**Check:**
1. Cloudinary credentials correct
2. File size within limits
3. File type allowed
4. Internet connection stable
5. Cloudinary service status

**Solutions:**
- Verify `.env.local` settings
- Check file size and type
- Try smaller file
- Restart application

### Cannot View Document

**Check:**
1. Signed URL expired
2. File deleted from Cloudinary
3. Permissions issue
4. Browser blocking

**Solutions:**
- Regenerate view link
- Check file exists in Cloudinary
- Clear browser cache
- Try different browser

### Slow Uploads

**Causes:**
- Large file size
- Slow internet
- Server load

**Solutions:**
- Compress files before upload
- Upload during off-peak hours
- Consider batch upload
- Check network connection

### Approaching Limits

**Solutions:**
1. Delete temporary/old files
2. Optimize file sizes
3. Archive to local storage
4. Upgrade plan

## Migration

### Migrating Existing Files

If you have existing files to migrate:

1. **Inventory Files**
   - List all files to migrate
   - Note file locations
   - Check file sizes

2. **Prepare for Upload**
   - Organize in folders
   - Rename consistently
   - Compress if needed

3. **Batch Upload**
   - Use Cloudinary bulk upload
   - Or use MyClinicSoft import tool
   - Maintain folder structure

4. **Update Database**
   - Update file references
   - Verify all links work
   - Test access

5. **Verify**
   - Check all files uploaded
   - Test downloads
   - Confirm patient access

## Advanced Features

### AI-Powered Tagging

Cloudinary can auto-tag images:
- Detects content
- Suggests tags
- Categorizes automatically

**Enable:**
- Cloudinary Dashboard → Add-ons
- Enable Auto Tagging
- Configure sensitivity

### OCR (Text Extraction)

Extract text from images:
- Scanned documents
- Handwritten notes
- Labels and forms

**Use Cases:**
- Make documents searchable
- Extract patient data
- Digitize old records

### Video Support

Store and stream videos:
- Educational content
- Procedure recordings
- Patient education

## Related Documentation

- [Document Management](DOCUMENT_MANAGEMENT.md)
- [Patient Management](PATIENT_MANAGEMENT.md)
- [Settings](SETTINGS_CONFIGURATION.md)
- [Security and Compliance](SECURITY_COMPLIANCE.md)
