'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Cog, Home, LayoutGrid, Plug, ListChecks } from 'lucide-react';
import { cn } from '@/core/lib/cn';

const NAV: Array<{ href: string; label: string; Icon: React.ComponentType<{ className?: string }> }> =
  [
    { href: '/dashboard', label: 'Dashboard', Icon: Home },
    { href: '/connections', label: 'Connections', Icon: Plug },
    { href: '/listings', label: 'Listings', Icon: LayoutGrid },
    { href: '/reservations', label: 'Reservations', Icon: ListChecks },
    { href: '/settings', label: 'Settings', Icon: Cog },
  ];

export function Sidebar({ workspaceName }: { workspaceName: string }) {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-white/[0.06] flex flex-col">
      <div className="px-4 py-4 border-b border-white/[0.06]">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#ff7a2b' }}>
          repull · channel mgr
        </div>
        <div className="text-sm font-medium mt-1 truncate">{workspaceName}</div>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm',
                active
                  ? 'bg-repull/10 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.04]',
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/[0.06] flex items-center gap-2 text-xs muted">
        <Calendar className="w-3 h-3" />
        Powered by{' '}
        <a className="underline decoration-dotted" href="https://repull.dev">
          Repull
        </a>
      </div>
    </aside>
  );
}
