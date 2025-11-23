'use client';

import { signup } from '@/app/actions/auth';
import { useActionState } from 'react';
import Link from 'next/link';

export default function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="space-y-5">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400">
            <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM12.5 14.5c0-2.485-2.239-4.5-5-4.5s-5 2.015-5 4.5" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </div>
        <input
          id="name"
          name="name"
          placeholder="John Doe"
          required
          autoComplete="name"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
        />
      </div>
      {state?.errors?.name && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {state.errors.name[0]}
        </div>
      )}

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400">
            <path d="M2.5 4C2.5 3.17157 3.17157 2.5 4 2.5H12C12.8284 2.5 13.5 3.17157 13.5 4V12C13.5 12.8284 12.8284 13.5 12 13.5H4C3.17157 13.5 2.5 12.8284 2.5 12V4Z" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M2.5 5.5L8 9.5L13.5 5.5" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </div>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
        />
      </div>
      {state?.errors?.email && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {state.errors.email[0]}
        </div>
      )}

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400">
            <path d="M4 6V4C4 2.34315 5.34315 1 7 1H9C10.6569 1 12 2.34315 12 4V6M4 6H2C1.44772 6 1 6.44772 1 7V13C1 13.5523 1.44772 14 2 14H14C14.5523 14 15 13.5523 15 13V7C15 6.44772 14.5523 6 14 6H12M4 6H12" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="7.5" y="9.5" width="1" height="1" fill="currentColor"/>
          </svg>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Create a strong password"
          required
          autoComplete="new-password"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
        />
      </div>
      {state?.errors?.password && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <div className="font-bold mb-2">Password requirements:</div>
          <ul className="list-disc pl-5">
            {state.errors.password.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <select
        name="role"
        defaultValue="user"
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
      >
        <option value="user">User</option>
        <option value="doctor">Doctor</option>
        <option value="admin">Admin</option>
      </select>
      {state?.errors?.role && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {state.errors.role[0]}
        </div>
      )}

      {state?.message && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
      >
        {pending ? 'Creating account...' : 'Create Account'}
      </button>

      <div className="text-center text-sm pt-4 border-t">
        <span className="text-gray-600">Already have an account? </span>
        <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700">
          Log in
        </Link>
      </div>
    </form>
  );
}
