import type { ReactNode } from 'react';

export function PageFrame({
  eyebrow = 'Live operations',
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 animate-fade-in">
      <div className="border-b border-border/70 pb-5">
        <div className="mb-3 inline-flex items-center rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {eyebrow}
        </div>
        <h1 className="text-3xl font-semibold leading-tight">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
