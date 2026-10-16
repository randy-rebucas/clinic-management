import { loadDocumentPermissions } from '@/lib/documents-page';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { MAX_INLINE_UPLOAD_BYTES } from '@/lib/upload-validation';
import { MAX_DOCUMENT_BYTES } from '@/lib/documents';
import DocumentUploadClient from '@/components/DocumentUploadClient';

export default async function DocumentUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; visitId?: string }>;
}) {
  // Uploading is documents:write, the POST check. It used to require patients:create, which no
  // role holds, so only admins and owners could upload.
  await loadDocumentPermissions('write');
  const params = await searchParams;
  // The same cap the API applies: files kept inline in the database are smaller.
  const maxBytes = isCloudinaryConfigured() ? MAX_DOCUMENT_BYTES : MAX_INLINE_UPLOAD_BYTES;
  return <DocumentUploadClient patientId={params.patientId} visitId={params.visitId} maxBytes={maxBytes} />;
}
