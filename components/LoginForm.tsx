'use client';

import { login } from '@/app/actions/auth';
import { useActionState } from 'react';
import Link from 'next/link';
import { Button, TextField, Callout } from '@radix-ui/themes';

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-5">
      <TextField.Root size="3">
        <TextField.Slot>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.5 4C2.5 3.17157 3.17157 2.5 4 2.5H12C12.8284 2.5 13.5 3.17157 13.5 4V12C13.5 12.8284 12.8284 13.5 12 13.5H4C3.17157 13.5 2.5 12.8284 2.5 12V4Z" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M2.5 5.5L8 9.5L13.5 5.5" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </TextField.Slot>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
          style={{ all: 'unset', flex: 1 }}
        />
      </TextField.Root>
      {state?.errors?.email && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{state.errors.email[0]}</Callout.Text>
        </Callout.Root>
      )}

      <TextField.Root size="3">
        <TextField.Slot>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 6V4C4 2.34315 5.34315 1 7 1H9C10.6569 1 12 2.34315 12 4V6M4 6H2C1.44772 6 1 6.44772 1 7V13C1 13.5523 1.44772 14 2 14H14C14.5523 14 15 13.5523 15 13V7C15 6.44772 14.5523 6 14 6H12M4 6H12" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="7.5" y="9.5" width="1" height="1" fill="currentColor"/>
          </svg>
        </TextField.Slot>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Enter your password"
          required
          autoComplete="current-password"
          style={{ all: 'unset', flex: 1 }}
        />
      </TextField.Root>
      {state?.errors?.password && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{state.errors.password[0]}</Callout.Text>
        </Callout.Root>
      )}

      {state?.message && (
        <Callout.Root color="red" size="2">
          <Callout.Text>{state.message}</Callout.Text>
        </Callout.Root>
      )}

      <Button
        type="submit"
        disabled={pending}
        size="3"
        variant="solid"
        color="blue"
        className="w-full"
      >
        {pending ? 'Signing in...' : 'Sign In'}
      </Button>

      <div className="text-center text-sm pt-4 border-t">
        <span className="text-gray-11">Don&apos;t have an account? </span>
        <Link href="/signup" className="font-semibold text-blue-9 hover:text-blue-10">
          Sign up
        </Link>
      </div>
    </form>
  );
}
