import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'PagerZero · Mission Control',
  description: 'Autonomous incident response — detect, diagnose, verify, and ship fixes, gated by policy.',
};

const fallbackCss = `
  :root {
    color-scheme: light;
    --fallback-bg: #f8fafc;
    --fallback-fg: #111827;
    --fallback-card: #ffffff;
    --fallback-border: #d8dee8;
    --fallback-muted: #64748b;
    --fallback-primary: #0f8897;
    --fallback-success: #0f9f6e;
  }

  html.dark {
    color-scheme: dark;
    --fallback-bg: #141414;
    --fallback-fg: #f5f7fb;
    --fallback-card: #1c1c1c;
    --fallback-border: #3a3a3a;
    --fallback-muted: #a5adba;
    --fallback-primary: #32c5c7;
    --fallback-success: #35c98f;
  }

  body {
    margin: 0;
    background: var(--fallback-bg);
    color: var(--fallback-fg);
    font-family: var(--font-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  body > div {
    min-height: 100vh;
  }

  .flex { display: flex; }
  .grid { display: grid; }
  .hidden { display: none; }
  .block { display: block; }
  .inline-flex { display: inline-flex; }
  .min-h-screen { min-height: 100vh; }
  .h-screen { height: 100vh; }
  .h-16 { height: 4rem; }
  .w-64 { width: 16rem; }
  .w-full { width: 100%; }
  .max-w-sm { max-width: 24rem; }
  .min-w-0 { min-width: 0; }
  .flex-1 { flex: 1 1 0%; }
  .shrink-0 { flex-shrink: 0; }
  .flex-col { flex-direction: column; }
  .items-center { align-items: center; }
  .items-start { align-items: flex-start; }
  .justify-between { justify-content: space-between; }
  .justify-end { justify-content: flex-end; }
  .place-items-center { place-items: center; }
  .gap-1 { gap: 0.25rem; }
  .gap-2 { gap: 0.5rem; }
  .gap-3 { gap: 0.75rem; }
  .gap-4 { gap: 1rem; }
  .space-y-1 > * + * { margin-top: 0.25rem; }
  .space-y-2 > * + * { margin-top: 0.5rem; }
  .space-y-3 > * + * { margin-top: 0.75rem; }
  .space-y-4 > * + * { margin-top: 1rem; }
  .sticky { position: sticky; }
  .relative { position: relative; }
  .absolute { position: absolute; }
  .top-0 { top: 0; }
  .z-30 { z-index: 30; }
  .overflow-hidden { overflow: hidden; }
  .overflow-x-auto { overflow-x: auto; }
  .rounded-md { border-radius: 0.375rem; }
  .rounded-lg { border-radius: 0.5rem; }
  .rounded-xl { border-radius: 0.75rem; }
  .rounded-full { border-radius: 9999px; }
  .border { border: 1px solid var(--fallback-border); }
  .border-r { border-right: 1px solid var(--fallback-border); }
  .border-b { border-bottom: 1px solid var(--fallback-border); }
  .border-y { border-top: 1px solid var(--fallback-border); border-bottom: 1px solid var(--fallback-border); }
  .p-0 { padding: 0; }
  .p-3 { padding: 0.75rem; }
  .p-4 { padding: 1rem; }
  .p-5 { padding: 1.25rem; }
  .p-6 { padding: 1.5rem; }
  .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
  .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
  .px-4 { padding-left: 1rem; padding-right: 1rem; }
  .px-5 { padding-left: 1.25rem; padding-right: 1.25rem; }
  .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
  .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
  .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
  .py-4 { padding-top: 1rem; padding-bottom: 1rem; }
  .py-6 { padding-top: 1.5rem; padding-bottom: 1.5rem; }
  .pb-4 { padding-bottom: 1rem; }
  .pt-0 { padding-top: 0; }
  .mt-1 { margin-top: 0.25rem; }
  .mt-2 { margin-top: 0.5rem; }
  .mt-3 { margin-top: 0.75rem; }
  .mt-4 { margin-top: 1rem; }
  .mt-auto { margin-top: auto; }
  .mb-3 { margin-bottom: 0.75rem; }
  .ml-auto { margin-left: auto; }
  .text-xs { font-size: 0.75rem; line-height: 1rem; }
  .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
  .text-base { font-size: 1rem; line-height: 1.5rem; }
  .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
  .text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
  .font-medium { font-weight: 500; }
  .font-semibold { font-weight: 600; }
  .font-bold { font-weight: 700; }
  .font-mono { font-family: var(--font-mono), ui-monospace, SFMono-Regular, monospace; }
  .leading-tight { line-height: 1.25; }
  .leading-6 { line-height: 1.5rem; }
  .text-left { text-align: left; }
  .text-right { text-align: right; }
  .uppercase { text-transform: uppercase; }
  .tabular-nums { font-variant-numeric: tabular-nums; }
  .shadow-sm { box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08); }
  .size-1\\.5 { width: 0.375rem; height: 0.375rem; }
  .size-2 { width: 0.5rem; height: 0.5rem; }
  .size-3\\.5 { width: 0.875rem; height: 0.875rem; }
  .size-4 { width: 1rem; height: 1rem; }
  .size-7 { width: 1.75rem; height: 1.75rem; }
  .size-9 { width: 2.25rem; height: 2.25rem; }

  @media (min-width: 768px) {
    .md\\:flex { display: flex; }
    .md\\:hidden { display: none; }
    .md\\:px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
  }

  @media (min-width: 1024px) {
    .lg\\:px-8 { padding-left: 2rem; padding-right: 2rem; }
    .lg\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (min-width: 1280px) {
    .xl\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }

  aside {
    background: var(--fallback-card);
    border-right: 1px solid var(--fallback-border);
  }

  aside a,
  header a,
  nav a {
    color: inherit;
    text-decoration: none;
  }

  aside svg,
  header svg,
  nav svg,
  main svg {
    width: 1rem;
    height: 1rem;
    vertical-align: middle;
  }

  main {
    min-width: 0;
  }

  header {
    background: color-mix(in srgb, var(--fallback-bg) 92%, transparent);
    border-bottom: 1px solid var(--fallback-border);
  }

  h1, h2, h3, p {
    margin-top: 0;
  }

  button,
  input,
  select {
    font: inherit;
  }

  button,
  .rounded-lg,
  .rounded-md,
  .rounded-xl {
    border-color: var(--fallback-border);
  }

  [class*="border"] {
    border-color: var(--fallback-border);
  }

  [class*="bg-card"],
  [class*="bg-background"] {
    background-color: var(--fallback-card);
  }

  [class*="text-muted"] {
    color: var(--fallback-muted);
  }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <style id="pagerzero-fallback-css" dangerouslySetInnerHTML={{ __html: fallbackCss }} />
      </head>
      <body className="font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
