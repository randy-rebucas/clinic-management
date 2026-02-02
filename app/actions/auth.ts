'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { SignupFormSchema, LoginFormSchema, SignupFormState, LoginFormState } from '@/app/lib/definitions';
import { createSession, deleteSession } from '@/app/lib/dal';
import { sanitizeEmail, checkRateLimit, resetRateLimit } from '@/app/lib/security';
import { getTenantContext } from '@/lib/tenant';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Role from '@/models/Role';
import bcrypt from 'bcryptjs';

export async function signup(
  state: SignupFormState,
  formData: FormData
): Promise<SignupFormState> {
  // Validate form fields
  const validatedFields = SignupFormSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role') || 'user',
  });

  // If any form fields are invalid, return early
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { name, email, password, role } = validatedFields.data;
  const sanitizedEmail = sanitizeEmail(email);

  try {
    await connectDB();

    // Get tenant context for multi-tenant support
    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;

    // Check if user already exists (case-insensitive, within tenant scope if tenant exists)
    const userQuery: any = { email: sanitizedEmail };
    if (tenantId) {
      userQuery.tenantId = tenantId;
    } else {
      // If no tenant, check for users without tenantId (backward compatibility)
      userQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const existingUser = await User.findOne(userQuery);
    if (existingUser) {
      return {
        errors: {
          email: ['An account with this email already exists.'],
        },
      };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Get or create default role if role is provided as string
    let roleDoc;
    
    if (role && typeof role === 'string' && role !== 'user') {
      roleDoc = await Role.findOne({ name: role });
      if (!roleDoc) {
        // Create default role if it doesn't exist
        const roleName = role as string;
        roleDoc = await Role.create({
          name: roleName,
          displayName: roleName.charAt(0).toUpperCase() + roleName.slice(1),
          isActive: true,
        });
      }
    } else {
      // Default to receptionist role if not specified
      roleDoc = await Role.findOne({ name: 'receptionist' });
      if (!roleDoc) {
        roleDoc = await Role.create({
          name: 'receptionist',
          displayName: 'Receptionist',
          isActive: true,
        });
      }
    }

    // Create user (normalize email to lowercase)
    const userData: any = {
      name,
      email: sanitizedEmail,
      password: hashedPassword,
      role: roleDoc._id,
    };
    
    // Add tenantId if tenant exists
    if (tenantId) {
      userData.tenantId = tenantId;
    }
    
    const user = await User.create(userData);

    // Create session with role name, roleId, and tenantId
    await createSession(
      user._id.toString(), 
      user.email, 
      roleDoc.name as 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative',
      roleDoc._id.toString(),
      tenantId || undefined
    );

    revalidatePath('/dashboard');
    redirect('/dashboard');
  } catch (error) {
    console.error('Signup error:', error);
    return {
      message: 'An error occurred during signup. Please try again.',
    };
  }
}

export async function login(
  state: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  // Validate form fields
  const validatedFields = LoginFormSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  // If any form fields are invalid, return early
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { email, password } = validatedFields.data;
  const sanitizedEmail = sanitizeEmail(email);

  try {
    // Rate limiting check
    const rateLimitCheck = checkRateLimit(sanitizedEmail);
    if (!rateLimitCheck.allowed) {
      return {
        errors: {
          email: [
            `Too many login attempts. Please try again in ${rateLimitCheck.remainingTime} minute(s).`,
          ],
        },
      };
    }

    await connectDB();

    // Get tenant context for multi-tenant support
    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;
    console.log('Tenant context in login:', tenantContext);
    // Find user by email (case-insensitive, within tenant scope if tenant exists) with role populated
    const userQuery: any = { email: sanitizedEmail };
    if (tenantId) {
      userQuery.tenantId = tenantId;
    } else {
      // If no tenant, check for users without tenantId (backward compatibility)
      userQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const user = await User.findOne(userQuery)
      .populate('role', 'name displayName');
    if (!user) {
      // Use generic error message to prevent user enumeration
      return {
        errors: {
          email: ['Invalid email or password.'],
        },
      };
    }

    // Check if user has a password
    if (!user.password) {
      console.error('Login error: User has no password set', { userId: user._id, email: user.email });
      return {
        errors: {
          email: ['Invalid email or password.'],
        },
      };
    }

    // Check if user is active
    if (user.status !== 'active') {
      return {
        errors: {
          email: ['Your account is not active. Please contact your administrator.'],
        },
      };
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      // Use generic error message to prevent user enumeration
      return {
        errors: {
          email: ['Invalid email or password.'],
        },
      };
    }

    // Reset rate limit on successful login
    resetRateLimit(sanitizedEmail);

    // Helper function to find role by name with tenant context
    const findRoleByName = async (name: string): Promise<any> => {
      if (tenantId) {
        // First try tenant-scoped role
        const tenantRole = await Role.findOne({ name, tenantId });
        if (tenantRole) return tenantRole;
        // If not found, try global role
        return await Role.findOne({ 
          name,
          $or: [{ tenantId: { $exists: false } }, { tenantId: null }]
        });
      } else {
        // No tenant, look for global role
        return await Role.findOne({ name });
      }
    };

    // Helper function to determine role from user profile fields
    const determineRoleFromProfile = (user: any): string | null => {
      if (user.adminProfile) return 'admin';
      if (user.doctorProfile) return 'doctor';
      if (user.nurseProfile) return 'nurse';
      if (user.receptionistProfile) return 'receptionist';
      if (user.accountantProfile) return 'accountant';
      if (user.medicalRepresentativeProfile) return 'medical-representative';
      return null;
    };

    // Get role name from populated role or fallback
    let roleName: 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative' = 'receptionist';
    let roleId: string | undefined;
    
    if (user.role) {
      if (typeof user.role === 'object' && 'name' in user.role) {
        roleName = (user.role as any).name as 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative';
        roleId = (user.role as any)._id?.toString();
      } else {
        // Role is ObjectId, fetch it (consider tenant context if applicable)
        let roleDoc;
        if (tenantId) {
          // First try tenant-scoped role
          roleDoc = await Role.findOne({ _id: user.role, tenantId });
          // If not found, try global role
          if (!roleDoc) {
            roleDoc = await Role.findOne({ 
              _id: user.role,
              $or: [{ tenantId: { $exists: false } }, { tenantId: null }]
            });
          }
        } else {
          // No tenant, look for global role or any role with this ID
          roleDoc = await Role.findById(user.role);
        }
        
        if (roleDoc) {
          roleName = roleDoc.name as 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative';
          roleId = roleDoc._id.toString();
        } else {
          console.error('Login error: Role not found by ID', { 
            roleId: user.role, 
            userId: user._id, 
            email: user.email,
            tenantId 
          });
          // Try to determine role from profile fields
          const profileRole = determineRoleFromProfile(user);
          if (profileRole) {
            const fallbackRole = await findRoleByName(profileRole);
            if (fallbackRole) {
              roleName = fallbackRole.name as 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative';
              roleId = fallbackRole._id.toString();
              console.log(`✅ Found role from profile: ${roleName}`, { userId: user._id, email: user.email });
            }
          }
          // If still no roleId, try receptionist as last resort
          if (!roleId) {
            const fallbackRole = await findRoleByName('receptionist');
            if (fallbackRole) {
              roleId = fallbackRole._id.toString();
              console.warn(`⚠️  Using receptionist role as fallback`, { userId: user._id, email: user.email });
            }
          }
        }
      }
    } else {
      console.error('Login error: User has no role assigned', { 
        userId: user._id, 
        email: user.email 
      });
      // Try to determine role from profile fields
      const profileRole = determineRoleFromProfile(user);
      if (profileRole) {
        const fallbackRole = await findRoleByName(profileRole);
        if (fallbackRole) {
          roleName = fallbackRole.name as 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative';
          roleId = fallbackRole._id.toString();
          console.log(`✅ Found role from profile: ${roleName}`, { userId: user._id, email: user.email });
        }
      }
      // If still no roleId, try receptionist as last resort
      if (!roleId) {
        const fallbackRole = await findRoleByName('receptionist');
        if (fallbackRole) {
          roleId = fallbackRole._id.toString();
          console.warn(`⚠️  Using receptionist role as fallback`, { userId: user._id, email: user.email });
        }
      }
    }

    // Create session with role name, roleId, and tenantId
    await createSession(
      user._id.toString(), 
      user.email, 
      roleName, 
      roleId,
      tenantId || undefined
    );

    // Log login for audit trail
    try {
      const { logLogin } = await import('@/lib/audit');
      await logLogin(
        user._id.toString(),
        user.email,
        user.role,
        undefined, // IP address would need to be passed from request
        undefined // User agent would need to be passed from request
      );
    } catch (error) {
      // Don't fail login if audit logging fails
      console.error('Error logging login:', error);
    }

    revalidatePath('/dashboard');
    redirect('/dashboard');
  } catch (error: any) {
    console.error('Login error:', error);
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    
    // Return more specific error if it's a known issue
    if (error?.message?.includes('password')) {
      return {
        errors: {
          email: ['An error occurred during password verification. Please try again.'],
        },
      };
    }
    
    if (error?.message?.includes('role') || error?.message?.includes('Role')) {
      return {
        message: 'An error occurred while verifying your role. Please contact your administrator.',
      };
    }
    
    return {
      message: 'An error occurred during login. Please try again.',
    };
  }
}

export async function loginMedicalRep() {
  try {
    await deleteSession();
    revalidatePath('/');
  } catch (error) {
    console.error('Error during medical representative login:', error);
  }
  redirect('/medical-representatives/login');
}

export async function logout() {
  try {
    await deleteSession();
    revalidatePath('/');
  } catch (error) {
    console.error('Error during logout:', error);
  }
  redirect('/login');
}

