import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: Types.ObjectId; // Reference to Role
  // Staff information reference (one-to-one relationship) - DEPRECATED: Use role-specific profiles instead
  staffInfo?: Types.ObjectId;
  // Permissions reference (one-to-many relationship)
  permissions?: Types.ObjectId[];
  // Role-specific profile references (one-to-one relationships)
  adminProfile?: Types.ObjectId;
  doctorProfile?: Types.ObjectId;
  nurseProfile?: Types.ObjectId;
  receptionistProfile?: Types.ObjectId;
  accountantProfile?: Types.ObjectId;
  medicalRepresentativeProfile?: Types.ObjectId;
  status: 'active' | 'inactive' | 'suspended';
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters long'],
    },
    role: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: [true, 'Role is required'],
      index: true,
    },
    staffInfo: {
      type: Schema.Types.ObjectId,
      ref: 'Staff',
      index: true,
    },
    permissions: [{
      type: Schema.Types.ObjectId,
      ref: 'Permission',
    }],
    adminProfile: { type: Schema.Types.ObjectId, ref: 'Admin' },
    doctorProfile: { type: Schema.Types.ObjectId, ref: 'Doctor' },
    nurseProfile: { type: Schema.Types.ObjectId, ref: 'Nurse' },
    receptionistProfile: { type: Schema.Types.ObjectId, ref: 'Receptionist' },
    accountantProfile: { type: Schema.Types.ObjectId, ref: 'Accountant' },
    medicalRepresentativeProfile: { type: Schema.Types.ObjectId, ref: 'MedicalRepresentative' },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },
    lastLogin: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
UserSchema.index({ adminProfile: 1 });
UserSchema.index({ doctorProfile: 1 });
UserSchema.index({ nurseProfile: 1 });
UserSchema.index({ receptionistProfile: 1 });
UserSchema.index({ accountantProfile: 1 });
UserSchema.index({ medicalRepresentativeProfile: 1 });
UserSchema.index({ role: 1, status: 1 }); // For role-based status queries
UserSchema.index({ status: 1 }); // For status-based queries
UserSchema.index({ email: 1 }); // Additional index for email lookups (unique already creates one, but explicit is better)
UserSchema.index({ lastLogin: -1 }); // For recent login queries
UserSchema.index({ createdAt: -1 }); // For sorting by creation date

// Validation: Ensure role consistency with all profile types
UserSchema.pre('save', async function (next) {
  // Skip validation if none of the relevant fields are modified
  const profileFields = ['role', 'staffInfo', 'adminProfile', 'doctorProfile', 'nurseProfile', 'receptionistProfile', 'accountantProfile', 'medicalRepresentativeProfile'];
  if (!profileFields.some(field => this.isModified(field))) {
    return next();
  }

  try {
    // Get all profile fields
    const allProfiles = [
      this.staffInfo,
      this.adminProfile,
      this.doctorProfile,
      this.nurseProfile,
      this.receptionistProfile,
      this.accountantProfile,
      this.medicalRepresentativeProfile
    ];
    
    // Validation: Cannot have multiple profile types set simultaneously
    const profileCount = allProfiles.filter(Boolean).length;
    if (profileCount > 1) {
      return next(new Error('User cannot have multiple profile types set simultaneously'));
    }

    // Only validate role consistency if role is populated or we can populate it
    let roleName: string | null = null;
    
    // Check if role is already populated (object with name property)
    if (this.role && typeof this.role === 'object' && 'name' in this.role) {
      roleName = (this.role as any).name;
    } else if (this.role) {
      // Try to populate role if it's just an ObjectId
      try {
        await this.populate('role');
        if (this.role && typeof this.role === 'object' && 'name' in this.role) {
          roleName = (this.role as any).name;
        }
      } catch (populateError) {
        // If population fails, skip role-based validation but still check conflicts
        console.warn('Could not populate role for validation, skipping role-based checks');
      }
    }

    // If we have role name, validate consistency
    if (roleName) {
      const isAdminRole = roleName === 'admin';
      const isDoctorRole = roleName === 'doctor';
      const isNurseRole = roleName === 'nurse';
      const isReceptionistRole = roleName === 'receptionist';
      const isAccountantRole = roleName === 'accountant';
      const isMedicalRepRole = roleName === 'medical-representative';

      // Validation: Role-specific profile warnings (warning only, as profile might be set later)
      if (isAdminRole && !this.adminProfile) {
        console.warn(`⚠️  User with admin role (${this.email}) does not have adminProfile set`);
      }
      if (isDoctorRole && !this.doctorProfile) {
        console.warn(`⚠️  User with doctor role (${this.email}) does not have doctorProfile set`);
      }
      if (isNurseRole && !this.nurseProfile) {
        console.warn(`⚠️  User with nurse role (${this.email}) does not have nurseProfile set`);
      }
      if (isReceptionistRole && !this.receptionistProfile) {
        console.warn(`⚠️  User with receptionist role (${this.email}) does not have receptionistProfile set`);
      }
      if (isAccountantRole && !this.accountantProfile) {
        console.warn(`⚠️  User with accountant role (${this.email}) does not have accountantProfile set`);
      }
      if (isMedicalRepRole && !this.medicalRepresentativeProfile) {
        console.warn(`⚠️  User with medical-representative role (${this.email}) does not have medicalRepresentativeProfile set`);
      }

      // Validation: If a profile is set, role must match
      if (this.adminProfile && !isAdminRole) {
        return next(new Error('User with adminProfile must have admin role'));
      }
      if (this.doctorProfile && !isDoctorRole) {
        return next(new Error('User with doctorProfile must have doctor role'));
      }
      if (this.nurseProfile && !isNurseRole) {
        return next(new Error('User with nurseProfile must have nurse role'));
      }
      if (this.receptionistProfile && !isReceptionistRole) {
        return next(new Error('User with receptionistProfile must have receptionist role'));
      }
      if (this.accountantProfile && !isAccountantRole) {
        return next(new Error('User with accountantProfile must have accountant role'));
      }
      if (this.medicalRepresentativeProfile && !isMedicalRepRole) {
        return next(new Error('User with medicalRepresentativeProfile must have medical-representative role'));
      }
      
      // Legacy staffInfo validation (for backward compatibility)
      const staffRoles = ['nurse', 'receptionist', 'accountant'];
      const isStaffRole = staffRoles.includes(roleName);
      if (this.staffInfo && !isStaffRole && !isAdminRole) {
        return next(new Error('User with staffInfo must have a staff role (nurse, receptionist, or accountant) or admin role'));
      }
    } else {
      // If we can't get role name, still validate that profiles aren't conflicting
      // This handles the case where role is just an ObjectId
      const profileCount = allProfiles.filter(Boolean).length;
      if (profileCount > 1) {
        return next(new Error('User cannot have multiple profile types set simultaneously'));
      }
    }

    next();
  } catch (error: any) {
    next(error);
  }
});

// Prevent re-compilation during development
const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;

