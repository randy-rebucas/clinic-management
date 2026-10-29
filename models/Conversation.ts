import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IConversationMember {
  user: Types.ObjectId;
  // Messages from others since this member last read the conversation
  unread: number;
  lastReadAt?: Date;
  // Set when the member deletes the conversation: messages up to then are hidden from them
  clearedAt?: Date;
  // Out of the member's list until the next message arrives
  hidden?: boolean;
}

export interface IConversation extends Document {
  tenantId: Types.ObjectId;
  /**
   * direct (the default): 1:1 between two staff members of the same clinic.
   * support: one staff member and the MyClinicSoft platform team, who have no clinic account
   * and so aren't a member; their side of the conversation is `support`.
   */
  kind?: 'direct' | 'support';
  members: IConversationMember[];
  // Sorted member ids joined with ':' so a pair maps to exactly one conversation;
  // `support:<userId>` for a support thread (supportMemberKey)
  memberKey: string;
  /** Support threads: the platform team's unread count and when they last read it. */
  support?: { unread: number; lastReadAt?: Date };
  lastMessage?: {
    body: string;
    /** Unset when the platform support team sent it. */
    sender?: Types.ObjectId;
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
    clearedAt: { type: Date },
    hidden: { type: Boolean, default: false },
  },
  { _id: false }
);

const ConversationSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    kind: { type: String, enum: ['direct', 'support'], default: undefined },
    members: { type: [ConversationMemberSchema], required: true },
    memberKey: { type: String, required: true },
    support: {
      type: new Schema({ unread: { type: Number, default: 0, min: 0 }, lastReadAt: { type: Date } }, { _id: false }),
      default: undefined,
    },
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
// The platform's support inbox, across clinics; partial so direct conversations don't pay for it.
ConversationSchema.index({ lastMessageAt: -1 }, { partialFilterExpression: { kind: 'support' } });

export function conversationMemberKey(a: string, b: string) {
  return [a, b].sort().join(':');
}

export function supportMemberKey(userId: string) {
  return `support:${userId}`;
}

export default mongoose.models.Conversation ||
  mongoose.model<IConversation>('Conversation', ConversationSchema);
