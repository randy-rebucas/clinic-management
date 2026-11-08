import { loadDocumentPermissions } from '@/lib/documents-page';
import { MAX_UPLOAD_BYTES } from '@/lib/upload-validation';
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
  // The same cap the API applies.
  return <DocumentUploadClient patientId={params.patientId} visitId={params.visitId} maxBytes={MAX_UPLOAD_BYTES} />;
}
