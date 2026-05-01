import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Repull Channel Manager',
  description:
    'Open-source channel manager starter — fork it, deploy to Vercel, ship your own. Powered by Repull.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
