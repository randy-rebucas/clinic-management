import * as z from 'zod';

export const VALID_STAFF_ROLES = ['admin', 'owner', 'doctor', 'nurse', 'receptionist', 'accountant', 'medical-representative'] as const;
export type StaffRole = typeof VALID_STAFF_ROLES[number];

export const SignupFormSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }).trim(),
  email: z.string().email({ message: 'Please enter a valid email.' }).trim(),
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }),
  role: z.enum(VALID_STAFF_ROLES).optional().default('receptionist'),
});

export const LoginFormSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email.' }).trim(),
  password: z.string().min(1, { message: 'Password is required.' }),
});

export type SignupFormState =
  | {
      errors?: {
        name?: string[];
        email?: string[];
        password?: string[];
        role?: string[];
      };
      message?: string;
    }
  | undefined;

export type LoginFormState =
  | {
      errors?: {
        email?: string[];
        password?: string[];
      };
      message?: string;
    }
  | undefined;

