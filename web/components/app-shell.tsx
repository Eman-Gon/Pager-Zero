'use client';

import * as React from 'react';
import {
  Activity,
  LayoutDashboard,
  RadioTower,
  ScrollText,
  Search,
  Siren,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { CommandMenu } from '@/components/command-menu';
import { kpis } from '@/lib/mock-data';

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'incidents', label: 'Incident queue', icon: Siren },
  { id: 'trends', label: 'Trends & MTTR', icon: Activity },
  { id: 'runbooks', label: 'Runbook memory', icon: ScrollText },
];

function PagerZeroLogo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative grid place-items-center overflow-hidden rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-border',
        className,
      )}
      aria-hidden="true"
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_28%_22%,hsl(var(--success)/0.3),transparent_42%)]" />
      <RadioTower className="relative size-[55%]" strokeWidth={2.4} />
      <span className="absolute right-1 top-1 grid size-3 place-items-center rounded-full bg-success text-[8px] font-bold leading-none text-success-foreground ring-1 ring-background">
        0
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [active, setActive] = React.useState('overview');

  // Highlight the nav item whose section is in view.
  React.useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex min-h-screen">
      <CommandMenu />

      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card/40 px-3 py-4 md:flex">
        <div className="flex items-center gap-3 px-2 pb-4">
          <PagerZeroLogo className="size-9" />
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">PagerZero</div>
            <div className="text-xs text-muted-foreground">Mission Control</div>
          </div>
        </div>
        <Separator />
        <nav className="mt-3 flex flex-col gap-1">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => jump(n.id)}
              className={cn(
                'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active === n.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <n.icon className="size-4 shrink-0" />
              {n.label}
              {n.id === 'incidents' && kpis.openIncidents > 0 && (
                <Badge variant="secondary" className="ml-auto tabular-nums">
                  {kpis.openIncidents}
                </Badge>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-lg border bg-background/60 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <span className="size-2 rounded-full bg-success animate-pulse-ring" />
            Autonomous mode
          </div>
          <p className="mt-1">Sensor → diagnose → verify → ship, gated by policy.</p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <PagerZeroLogo className="size-7 rounded-lg" />
            <span className="text-sm font-semibold tracking-tight">PagerZero</span>
          </div>
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className={cn(
              'ml-auto flex h-9 w-full max-w-xs items-center gap-2 rounded-md border border-input bg-background px-3',
              'text-sm text-muted-foreground transition-colors hover:border-ring/40 md:ml-0',
            )}
          >
            <Search className="size-4" />
            Search…
            <kbd className="ml-auto hidden items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:flex">
              ⌘K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Badge variant="outline" className="hidden gap-1.5 sm:flex">
              <span className="size-1.5 rounded-full bg-success" />
              All systems nominal
            </Badge>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
