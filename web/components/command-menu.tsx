'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import {
  Activity,
  GitPullRequest,
  LayoutDashboard,
  Moon,
  Sun,
  Siren,
  ShieldCheck,
  ScrollText,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { incidents, statusLabels } from '@/lib/mock-data';

/** Global ⌘K / Ctrl-K command palette for the Mission Control shell. */
export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const { setTheme, resolvedTheme } = useTheme();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = React.useCallback((hash: string) => {
    setOpen(false);
    // Defer so the dialog closes before we scroll.
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search incidents or jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => go('overview')}>
            <LayoutDashboard />
            Overview
          </CommandItem>
          <CommandItem onSelect={() => go('incidents')}>
            <Siren />
            Incident queue
          </CommandItem>
          <CommandItem onSelect={() => go('trends')}>
            <Activity />
            Trends &amp; MTTR
          </CommandItem>
          <CommandItem onSelect={() => go('runbooks')}>
            <ScrollText />
            Runbook memory
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Open incidents">
          {incidents
            .filter((i) => i.status !== 'resolved')
            .map((i) => (
              <CommandItem key={i.id} value={`${i.id} ${i.rootCause}`} onSelect={() => go('incidents')}>
                {i.source === 'pagerduty' ? <Siren /> : i.source === 'sentry' ? <GitPullRequest /> : <ShieldCheck />}
                <span className="font-medium">{i.id}</span>
                <span className="text-muted-foreground">{i.rootCause}</span>
                <CommandShortcut>{statusLabels[i.status]}</CommandShortcut>
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem
            onSelect={() => {
              setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
              setOpen(false);
            }}
          >
            {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
            Toggle {resolvedTheme === 'dark' ? 'light' : 'dark'} mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
