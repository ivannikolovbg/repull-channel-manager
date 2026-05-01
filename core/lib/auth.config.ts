/**
 * Edge-safe NextAuth config — used by middleware. Contains NO database
 * adapter and NO node-only providers. The full config (with the Drizzle
 * adapter + email provider) lives in `auth.ts`.
 */

import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  trustHost: true,
  pages: { signIn: '/sign-in' },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
