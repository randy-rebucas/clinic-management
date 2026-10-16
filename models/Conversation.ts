import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IConversationMember {
  user: Types.ObjectId;
  // Messages from others since this member last read the conversation
  unread: number;
  lastReadAt?: Date;
}

export interface IConversation extends Document {
  tenantId: Types.ObjectId;
  // Direct (1:1) conversation between two staff members of the same clinic
  members: IConversationMember[];
  // Sorted member ids joined with ':' so a pair maps to exactly one conversation
  memberKey: string;
  lastMessage?: {
    body: string;
    sender: Types.ObjectId;
    createdAt: Date;
  };
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationMemberSchema = new Schema<IConversationMember>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    unread: { type: Number, default: 0, min: 0 },
    lastReadAt: { type: Date },
  },
  { _id: false }
);

const ConversationSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    members: { type: [ConversationMemberSchema], required: true },
    memberKey: { type: String, required: true },
    lastMessage: {
      body: { type: String },
      sender: { type: Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date },
    },
    lastMessageAt: { type: Date },
  },
  { timestamps: true }
);

ConversationSchema.index({ tenantId: 1, memberKey: 1 }, { unique: true });
ConversationSchema.index({ tenantId: 1, 'members.user': 1, lastMessageAt: -1 });

export function conversationMemberKey(a: string, b: string) {
  return [a, b].sort().join(':');
}

export default mongoose.models.Conversation ||
  mongoose.model<IConversation>('Conversation', ConversationSchema);
