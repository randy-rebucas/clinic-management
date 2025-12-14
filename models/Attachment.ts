import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAttachment extends Document {
  filename: string;
  contentType?: string;
  size?: number; // bytes
  url?: string; // if stored externally (S3, CDN) — recommended
  gridFsId?: Types.ObjectId; // if using GridFS
  uploadedBy?: Types.ObjectId;
  uploadDate: Date;
  notes?: string;
}

export const AttachmentSchema: Schema = new Schema(
  {
    filename: { type: String, required: true },
    contentType: { type: String },
    size: { type: Number }, // bytes
    url: { type: String }, // if stored externally (S3, CDN) — recommended
    gridFsId: { type: Schema.Types.ObjectId }, // if using GridFS
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadDate: { type: Date, default: Date.now },
    notes: { type: String },
  },
  { _id: true }
);

// Note: AttachmentSchema is typically embedded, so indexes are usually not needed
// If used as a standalone model, indexes would be added to the parent schema

// Export model (optional, if you want to use Attachment as a standalone model)
export default mongoose.models.Attachment || mongoose.model<IAttachment>('Attachment', AttachmentSchema);

