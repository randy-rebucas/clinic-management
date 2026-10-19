import mongoose, { Schema, Document, Types } from 'mongoose';
import { MESSAGE_MAX_LENGTH } from '@/lib/messaging';

export interface IMessage extends Document {
  tenantId: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  body: string;
  editedAt?: Date;
  // Deleted for everyone by the sender. The body is kept for the clinic's records but never served.
  deletedAt?: Date;
  // Members who deleted this message for themselves only
  hiddenFor: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: MESSAGE_MAX_LENGTH },
    editedAt: { type: Date },
    deletedAt: { type: Date },
    hiddenFor: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true }
);

MessageSchema.index({ tenantId: 1, conversation: 1, createdAt: -1, _id: -1 });
// Polling for new, edited and deleted messages
MessageSchema.index({ tenantId: 1, conversation: 1, updatedAt: 1 });

export default mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);
