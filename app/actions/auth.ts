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

    // Create user (normalize email to lowercase)
    const user = await User.create({
      name,
      email: sanitizedEmail,
      password: hashedPassword,
      role: role || 'user',
    });

    // Create session
    await createSession(user._id.toString(), user.email, user.role);

    revalidatePath('/');
    redirect('/');
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

    // Find user by email (case-insensitive)
    const user = await User.findOne({ email: sanitizedEmail });
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

    // Create session
    await createSession(user._id.toString(), user.email, user.role);

    revalidatePath('/');
    redirect('/');
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

