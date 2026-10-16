import mongoose, { Schema, Document, Types } from 'mongoose';
import { MESSAGE_MAX_LENGTH } from '@/lib/messaging';

export interface IMessage extends Document {
  tenantId: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: MESSAGE_MAX_LENGTH },
  },
  { timestamps: true }
);

MessageSchema.index({ tenantId: 1, conversation: 1, createdAt: -1, _id: -1 });

export default mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);
