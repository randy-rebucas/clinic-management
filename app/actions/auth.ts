'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { SignupFormSchema, LoginFormSchema, SignupFormState, LoginFormState } from '@/app/lib/definitions';
import { createSession, deleteSession } from '@/app/lib/dal';
import { sanitizeEmail, checkRateLimit, resetRateLimit } from '@/app/lib/security';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
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

    // Check if user already exists (case-insensitive)
    const existingUser = await User.findOne({ email: sanitizedEmail });
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
    const Role = (await import('@/models/Role')).default;
    let roleDoc;
    
    if (role && typeof role === 'string') {
      roleDoc = await Role.findOne({ name: role });
      if (!roleDoc) {
        // Create default role if it doesn't exist
        roleDoc = await Role.create({
          name: role,
          displayName: role.charAt(0).toUpperCase() + role.slice(1),
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
    const user = await User.create({
      name,
      email: sanitizedEmail,
      password: hashedPassword,
      role: roleDoc._id,
    });

    // Create session with role name and roleId
    await createSession(
      user._id.toString(), 
      user.email, 
      roleDoc.name as 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative',
      roleDoc._id.toString()
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

    // Find user by email (case-insensitive) with role populated
    const user = await User.findOne({ email: sanitizedEmail })
      .populate('role', 'name displayName');
    if (!user) {
      // Use generic error message to prevent user enumeration
      return {
        errors: {
          email: ['Invalid email or password.'],
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

    // Get role name from populated role or fallback
    const Role = (await import('@/models/Role')).default;
    let roleName: 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative' = 'receptionist';
    let roleId: string | undefined;
    
    if (user.role) {
      if (typeof user.role === 'object' && 'name' in user.role) {
        roleName = (user.role as any).name as 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative';
        roleId = (user.role as any)._id?.toString();
      } else {
        // Role is ObjectId, fetch it
        const roleDoc = await Role.findById(user.role);
        if (roleDoc) {
          roleName = roleDoc.name as 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative';
          roleId = roleDoc._id.toString();
        }
      }
    }

    // Create session with role name and roleId
    await createSession(user._id.toString(), user.email, roleName, roleId);

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
  } catch (error) {
    console.error('Login error:', error);
    return {
      message: 'An error occurred during login. Please try again.',
    };
  }
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

