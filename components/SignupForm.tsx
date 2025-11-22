'use client';

import { signup } from '@/app/actions/auth';
import { useActionState } from 'react';
import Link from 'next/link';
import { Button, TextField, Select, Callout, Text } from '@radix-ui/themes';

export default function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <form action={action} className="space-y-5">
      <TextField.Root size="3">
        <TextField.Slot>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM12.5 14.5c0-2.485-2.239-4.5-5-4.5s-5 2.015-5 4.5" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </TextField.Slot>
        <input
          id="name"
          name="name"
          placeholder="John Doe"
          required
          autoComplete="name"
          style={{ all: 'unset', flex: 1 }}
        />
      </TextField.Root>
      {state?.errors?.name && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{state.errors.name[0]}</Callout.Text>
        </Callout.Root>
      )}

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
          placeholder="Create a strong password"
          required
          autoComplete="new-password"
          style={{ all: 'unset', flex: 1 }}
        />
      </TextField.Root>
      {state?.errors?.password && (
        <Callout.Root color="red" size="2">
          <Callout.Text>
            <Text weight="bold" mb="2" as="div">Password requirements:</Text>
            <ul style={{ listStyle: 'disc', paddingLeft: '20px' }}>
              {state.errors.password.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </Callout.Text>
        </Callout.Root>
      )}

      <Select.Root name="role" defaultValue="user" size="3">
        <Select.Trigger />
        <Select.Content>
          <Select.Item value="user">User</Select.Item>
          <Select.Item value="doctor">Doctor</Select.Item>
          <Select.Item value="admin">Admin</Select.Item>
        </Select.Content>
      </Select.Root>
      {state?.errors?.role && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{state.errors.role[0]}</Callout.Text>
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
        {pending ? 'Creating account...' : 'Create Account'}
      </Button>

      <div className="text-center text-sm pt-4 border-t">
        <Text size="2" color="gray">Already have an account? </Text>
        <Link href="/login" className="font-semibold text-blue-9 hover:text-blue-10">
          Log in
        </Link>
      </div>
    </form>
  );
}
