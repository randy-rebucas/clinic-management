import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Document', () => ({
  default: { find: vi.fn(), updateOne: vi.fn(), deleteOne: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock('@/lib/document-file', () => ({
  PENDING_FILE_REMOVAL: { status: 'deleted', 'metadata.cloudinaryPublicId': { $exists: true }, 'metadata.fileRemovedAt': { $exists: false } },
  removeDocumentFile: vi.fn(),
  softDeleteDocument: vi.fn(),
}));

import Document from '@/models/Document';
import { removeDocumentFile, softDeleteDocument } from '@/lib/document-file';
import { bulkDeleteFiles, retryPendingFileRemovals } from '@/lib/storage-optimization';

const tenantId = new Types.ObjectId();
const userId = new Types.ObjectId().toString();
const found = (rows: unknown[]) => ({ select: () => ({ limit: () => ({ lean: async () => rows }), lean: async () => rows }) }) as any;

beforeEach(() => vi.clearAllMocks());

describe('retryPendingFileRemovals', () => {
  it('only looks at deleted documents whose file is still marked, and never erases a record', async () => {
    const a = { _id: new Types.ObjectId(), metadata: { cloudinaryPublicId: 'a' } };
    const b = { _id: new Types.ObjectId(), metadata: { cloudinaryPublicId: 'b' } };
    vi.mocked(Document.find).mockReturnValue(found([a, b]));
    vi.mocked(removeDocumentFile)
      .mockResolvedValueOnce({ gone: true, fields: { 'metadata.fileRemovedAt': new Date() } })
      .mockResolvedValueOnce({ gone: false, fields: {} });

    const res = await retryPendingFileRemovals(tenantId);

    const filter = (vi.mocked(Document.find).mock.calls[0] as any[])[0] as any;
    expect(filter).toMatchObject({ tenantId, status: 'deleted', 'metadata.fileRemovedAt': { $exists: false } });
    expect(res).toMatchObject({ filesRemoved: 1, filesPending: 1, success: false });
    expect(Document.updateOne).toHaveBeenCalledTimes(1);
    expect(Document.deleteOne).not.toHaveBeenCalled();
    expect(Document.deleteMany).not.toHaveBeenCalled();
  });

  it('changes nothing on a dry run', async () => {
    vi.mocked(Document.find).mockReturnValue(found([{ _id: new Types.ObjectId() }]));
    const res = await retryPendingFileRemovals(tenantId, { dryRun: true });
    expect(res.filesPending).toBe(1);
    expect(removeDocumentFile).not.toHaveBeenCalled();
    expect(Document.updateOne).not.toHaveBeenCalled();
  });
});

describe('bulkDeleteFiles', () => {
  it('soft-deletes each of the clinic’s documents and reports a file left behind', async () => {
    const doc = { _id: new Types.ObjectId(), size: 2048, documentCode: 'DOC-1', metadata: { cloudinaryPublicId: 'x' } };
    vi.mocked(Document.find).mockReturnValue(found([doc]));
    vi.mocked(softDeleteDocument).mockResolvedValue({ deleted: { _id: doc._id, status: 'deleted' }, fileGone: false });

    const res = await bulkDeleteFiles(tenantId, [String(doc._id)], userId);

    expect((vi.mocked(Document.find).mock.calls[0] as any[])[0]).toMatchObject({ tenantId, status: { $ne: 'deleted' } });
    expect(vi.mocked(softDeleteDocument).mock.calls[0][0]).toEqual({ _id: doc._id, tenantId });
    expect(res).toMatchObject({ deletedDocuments: 1, filesPending: 1, freedBytes: 2048 });
    expect(res.deleted).toEqual([{ _id: String(doc._id), documentCode: 'DOC-1', patient: undefined, size: 2048 }]);
    expect(Document.deleteOne).not.toHaveBeenCalled();
  });
});
