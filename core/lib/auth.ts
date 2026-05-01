/**
 * NextAuth (v5) configuration.
 *
 * Email magic-link only — zero external service required to start (logs the
 * link to the console in dev). Wire `EMAIL_SERVER` + `EMAIL_FROM` for prod.
 *
 * Multi-tenant via the workspaces table — auth gives us a userId, workspace
 * resolution happens via `getCurrentWorkspace()` in `core/lib/workspace.ts`.
 */

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import type { DefaultSession } from 'next-auth';
import { db } from '@/core/db';
import { accounts, sessions, users, verificationTokens } from '@/core/db/schema';
import { authConfig } from './auth.config';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: { id: string } & DefaultSession['user'];
  }
}

const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter,
  session: { strategy: 'database' },
  providers: [
    {
      id: 'email',
      name: 'Email',
      type: 'email',
      maxAge: 24 * 60 * 60,
      from: process.env.EMAIL_FROM ?? 'noreply@example.com',
      server: process.env.EMAIL_SERVER ?? '',
      // Custom send: in dev (no EMAIL_SERVER) print the magic link to stdout.
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        if (!provider.server) {
          // eslint-disable-next-line no-console
          console.log('\n[auth] Magic-link sign-in (no EMAIL_SERVER configured)');
          // eslint-disable-next-line no-console
          console.log(`[auth]   ${identifier}  →  ${url}\n`);
          return;
        }
        // Lazy require nodemailer only when actually sending. Optional dep —
        // we hide the specifier from the bundler with a non-literal so
        // installs without nodemailer still build cleanly.
        const mod = 'nodemai' + 'ler';
        const nodemailer = (await import(/* webpackIgnore: true */ mod).catch(() => null)) as {
          createTransport: (server: string) => {
            sendMail: (opts: {
              to: string;
              from: string;
              subject: string;
              text: string;
              html: string;
            }) => Promise<unknown>;
          };
        } | null;
        if (!nodemailer) {
          // eslint-disable-next-line no-console
          console.warn(
            '[auth] EMAIL_SERVER set but nodemailer is not installed. ' +
              'Add `nodemailer` to dependencies or unset EMAIL_SERVER.',
          );
          // eslint-disable-next-line no-console
          console.log(`[auth]   ${identifier}  →  ${url}\n`);
          return;
        }
        const transport = nodemailer.createTransport(provider.server as string);
        await transport.sendMail({
          to: identifier,
          from: provider.from as string,
          subject: 'Sign in to Repull Channel Manager',
          text: `Sign in: ${url}\n\nThis link expires in 24 hours.`,
          html: `<p>Click below to sign in to <strong>Repull Channel Manager</strong>.</p><p><a href="${url}">Sign in</a></p><p>This link expires in 24 hours.</p>`,
        });
      },
    },
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user && user) session.user.id = user.id;
      return session;
    },
  },
});
