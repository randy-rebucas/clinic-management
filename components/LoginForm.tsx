
'use client';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';

import { login } from '@/app/actions/auth';
import { useActionState } from 'react';
import Link from 'next/link';

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-6">
      {/* Email Field */}
      <div>
        <Label htmlFor="email" className="block text-sm font-medium mb-2">Email Address <span className="text-red-500">*</span></Label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400">
              <path d="M2.5 4C2.5 3.17157 3.17157 2.5 4 2.5H12C12.8284 2.5 13.5 3.17157 13.5 4V12C13.5 12.8284 12.8284 13.5 12 13.5H4C3.17157 13.5 2.5 12.8284 2.5 12V4Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M2.5 5.5L8 9.5L13.5 5.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </div>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            className="w-full pl-10 pr-4 py-2.5"
          />
        </div>
        {state?.errors?.email && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {state.errors.email[0]}
          </div>
        )}
      </div>
      {/* Password Field */}
      <div>
        <Label htmlFor="password" className="block text-sm font-medium mb-2">Password <span className="text-red-500">*</span></Label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400">
              <path d="M4 6V4C4 2.34315 5.34315 1 7 1H9C10.6569 1 12 2.34315 12 4V6M4 6H2C1.44772 6 1 6.44772 1 7V13C1 13.5523 1.44772 14 2 14H14C14.5523 14 15 13.5523 15 13V7C15 6.44772 14.5523 6 14 6H12M4 6H12" stroke="currentColor" strokeWidth="1.2" />
              <rect x="7.5" y="9.5" width="1" height="1" fill="currentColor" />
            </svg>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            className="w-full pl-10 pr-4 py-2.5"
          />
        </div>
        {state?.errors?.password && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {state.errors.password[0]}
          </div>
        )}
      </div>

      {/* General Error Message */}
      {state?.message && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.message}
        </div>
      )}

      {/* Submit Button */}
      <div>
        <Button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2"
        >
          {pending ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </Button>
      </div>

      {/* Sign Up Link */}
      <div>
        <p className="text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-semibold text-blue-600 hover:text-blue-700 transition-colors underline-offset-2 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </form>
  );
}
