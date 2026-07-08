'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Database,
  LayoutDashboard,
  ScrollText,
  Search,
  Siren,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { CommandMenu } from '@/components/command-menu';
import { kpis } from '@/lib/mock-data';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/incidents', label: 'Incident queue', icon: Siren },
  { href: '/trends', label: 'Trends & MTTR', icon: Activity },
  { href: '/neo4j', label: 'Neo4j nodes', icon: Database },
  { href: '/runbooks', label: 'Runbook memory', icon: ScrollText },
];

function PagerZeroLogo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative grid place-items-center overflow-hidden rounded-md bg-foreground text-background shadow-sm ring-1 ring-border',
        className,
      )}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 7px), repeating-linear-gradient(0deg, currentColor 0 1px, transparent 1px 7px)',
        }}
      />
      <span className="relative font-mono text-[13px] font-black leading-none tracking-normal">
        P0
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <CommandMenu />

      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/80 bg-card/70 px-3 py-4 md:flex">
        <div className="flex items-center gap-3 px-2 pb-4">
          <PagerZeroLogo className="size-9" />
          <div className="leading-tight">
            <div className="text-base font-semibold">PagerZero</div>
            <div className="text-xs text-muted-foreground">Mission Control</div>
          </div>
        </div>
        <Separator />
        <nav className="mt-3 flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                active(n.href)
                  ? 'border-primary/25 bg-primary/10 text-primary shadow-sm'
                  : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <n.icon className="size-4 shrink-0" />
              {n.label}
              {n.href === '/incidents' && kpis.openIncidents > 0 && (
                <Badge variant="secondary" className="ml-auto tabular-nums">
                  {kpis.openIncidents}
                </Badge>
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-lg border border-success/25 bg-success/10 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-success">
            <span className="size-2 rounded-full bg-success animate-pulse-ring" />
            Autonomous mode
          </div>
          <p className="mt-2 leading-5">Sensor to diagnosis, verification, and shipping gates.</p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/80 bg-background/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <PagerZeroLogo className="size-7 rounded-lg" />
            <span className="text-sm font-semibold">PagerZero</span>
          </div>
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className={cn(
              'ml-auto flex h-10 w-full max-w-sm items-center gap-2 rounded-lg border border-input bg-card/80 px-3',
              'text-sm text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground md:ml-0',
            )}
          >
            <Search className="size-4" />
            Search…
            <kbd className="ml-auto hidden items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:flex">
              ⌘K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Badge variant="outline" className="hidden gap-1.5 border-success/25 bg-success/10 text-success sm:flex">
              <span className="size-1.5 rounded-full bg-success" />
              All systems nominal
            </Badge>
            <ThemeToggle />
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border/80 bg-card/70 px-3 py-2 md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium',
                active(n.href)
                  ? 'border-primary/25 bg-primary/10 text-primary'
                  : 'border-transparent text-muted-foreground',
              )}
            >
              <n.icon className="size-3.5" />
              {n.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
