import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPermission extends Document {
  // Reference to User (many-to-one relationship) - required if role is not provided
  user?: Types.ObjectId;
  
  // Reference to Role (many-to-one relationship) - required if user is not provided
  role?: Types.ObjectId;
  
  // Permission details
  resource: string; // e.g., 'patients', 'appointments', 'billing'
  actions: string[]; // e.g., ['read', 'write', 'delete']
  
  createdAt: Date;
  updatedAt: Date;
}

const PermissionSchema: Schema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    role: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: false,
      index: true,
    },
    resource: {
      type: String,
      required: [true, 'Resource is required'],
      trim: true,
    },
    actions: {
      type: [String],
      required: [true, 'Actions are required'],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
PermissionSchema.index({ user: 1, resource: 1 }); // Compound index for user-resource lookups
PermissionSchema.index({ role: 1, resource: 1 }); // Compound index for role-resource lookups
PermissionSchema.index({ resource: 1 });

// Custom validation: either user or role must be provided
PermissionSchema.pre('validate', function(next) {
  if (!this.user && !this.role) {
    this.invalidate('user', 'Either user or role must be provided');
    this.invalidate('role', 'Either user or role must be provided');
  }
  if (this.user && this.role) {
    this.invalidate('user', 'Cannot assign permission to both user and role');
    this.invalidate('role', 'Cannot assign permission to both user and role');
  }
  next();
});

// Prevent re-compilation during development
const Permission = mongoose.models.Permission || mongoose.model<IPermission>('Permission', PermissionSchema);

export default Permission;

