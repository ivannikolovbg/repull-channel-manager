import { signOut } from '@/core/lib/auth';

export function SignOutButton() {
  async function action() {
    'use server';
    await signOut({ redirectTo: '/' });
  }
  return (
    <form action={action}>
      <button type="submit" className="btn btn-ghost text-xs">
        Sign out
      </button>
    </form>
  );
}
