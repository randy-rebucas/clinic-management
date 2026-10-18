import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { denyPage, getPermissionChecker } from '@/app/lib/auth-helpers';

export interface DocumentPermissions {
  /** Upload a document (documents:write, the POST check). */
  canUpload: boolean;
  /** Edit details, file to a patient, archive, mark staff-only, delete (documents:update). */
  canEdit: boolean;
}

/**
 * Documents pages follow the documents permission, as the API does. They used to check the
 * patients permission (so medical representatives, who may read patients, could list every
 * patient's files) and upload checked `patients:create`, which no role holds.
 */
export async function loadDocumentPermissions(required: 'read' | 'write' = 'read'): Promise<DocumentPermissions> {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  if (!can('documents', 'read')) await denyPage(session, 'documents', 'read', '/dashboard?error=access_denied');
  if (required === 'write' && !can('documents', 'write')) await denyPage(session, 'documents', 'write', '/documents?error=access_denied');
  return { canUpload: can('documents', 'write'), canEdit: can('documents', 'update') };
}
