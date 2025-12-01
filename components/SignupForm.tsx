'use client';

import { signup } from '@/app/actions/auth';
import { useActionState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

export default function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="space-y-5">
      <div>
        <Label htmlFor="name">Full Name</Label>
        <Input
          id="name"
          name="name"
          placeholder="John Doe"
          required
          autoComplete="name"
        />
      </div>
      {state?.errors?.name && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {state.errors.name[0]}
        </div>
      )}

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </div>
      {state?.errors?.email && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {state.errors.email[0]}
        </div>
      )}

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="Create a strong password"
          required
          autoComplete="new-password"
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

      <div>
        <Label htmlFor="role">Role</Label>
        <Select name="role" defaultValue="user">
          <SelectTrigger className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="doctor">Doctor</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
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

      <Button
        type="submit"
        disabled={pending}
        className="w-full"
      >
        {pending ? 'Creating account...' : 'Create Account'}
      </Button>

      <div className="text-center text-sm pt-4 border-t">
        <span className="text-gray-600">Already have an account? </span>
        <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700">
          Log in
        </Link>
      </div>
    </form>
  );
}
