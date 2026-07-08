'use client';

import * as React from 'react';
import { Database, RefreshCcw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn, formatNumber } from '@/lib/utils';

type PropertyValue = string | number | boolean | null | PropertyValue[] | { [key: string]: PropertyValue };

interface Neo4jNodeRow {
  elementId: string;
  display: string;
  labels: string[];
  properties: Record<string, PropertyValue>;
  incoming: number;
  outgoing: number;
}

interface LabelCount {
  label: string;
  count: number;
}

interface NodesPayload {
  total: number;
  labels: LabelCount[];
  nodes: Neo4jNodeRow[];
  error?: string;
}

function compactValue(value: PropertyValue): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 92 ? `${text.slice(0, 89)}...` : text;
}

function matchesQuery(node: Neo4jNodeRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${node.display} ${node.elementId} ${node.labels.join(' ')} ${JSON.stringify(node.properties)}`
    .toLowerCase()
    .includes(q);
}

function labelTone(label: string): string {
  const key = label.toLowerCase();
  if (key === 'function') return 'border-primary/20 bg-primary/10 text-primary';
  if (key === 'test') return 'border-sky-500/30 bg-sky-500/10 text-sky-400';
  if (key === 'runbook') return 'border-warning/30 bg-warning/10 text-warning';
  return 'border-border bg-muted text-muted-foreground';
}

export function Neo4jNodes() {
  const [data, setData] = React.useState<NodesPayload>({ total: 0, labels: [], nodes: [] });
  const [label, setLabel] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/neo4j/nodes?label=${encodeURIComponent(label)}&limit=200`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        const payload = (await res.json()) as NodesPayload;
        if (!res.ok) throw new Error(payload.error ?? `Neo4j request failed with ${res.status}`);
        setData(payload);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setData({ total: 0, labels: [], nodes: [] });
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [label, refreshKey]);

  const visible = React.useMemo(() => data.nodes.filter((node) => matchesQuery(node, query)), [data.nodes, query]);
  const visibleDegree = visible.reduce((sum, node) => sum + node.incoming + node.outgoing, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total nodes"
          value={formatNumber(data.total)}
          description="All graph records currently returned from Neo4j."
        />
        <MetricCard
          label="Visible"
          value={formatNumber(visible.length)}
          description="Rows left after the selected label and search filters."
        />
        <MetricCard
          label="Labels"
          value={formatNumber(data.labels.length)}
          description="Node types, such as Function, Test, or Runbook."
        />
        <MetricCard
          label="Visible degree"
          value={formatNumber(visibleDegree)}
          description="Total incoming and outgoing relationships on visible rows."
        />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="size-4" /> Neo4j nodes
              </CardTitle>
              <CardDescription>
                Live graph inventory from the configured Neo4j database. Use labels to switch
                between node types and search to find specific functions or runbooks.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((key) => key + 1)}
              disabled={loading}
              className="gap-2 self-start"
            >
              <RefreshCcw className={cn('size-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={label === '' ? 'default' : 'outline'} onClick={() => setLabel('')}>
                All
              </Button>
              {data.labels.map((item) => (
                <Button
                  type="button"
                  size="sm"
                  key={item.label}
                  variant={label === item.label ? 'default' : 'outline'}
                  onClick={() => setLabel(item.label)}
                  className="gap-2"
                >
                  {item.label}
                  <span className="font-mono text-xs opacity-65">{item.count}</span>
                </Button>
              ))}
            </div>
            <div className="relative min-w-0 lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search nodes"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {error ? (
            <div className="p-5 text-sm text-destructive">{error}</div>
          ) : loading ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
              Loading Neo4j nodes...
            </div>
          ) : visible.length ? (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-y text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium" title="The graph record name and Neo4j element ID.">Node</th>
                    <th className="px-3 py-2.5 font-medium" title="The type or types assigned to this node.">Labels</th>
                    <th className="px-3 py-2.5 font-medium" title="Incoming and outgoing relationship counts.">Degree</th>
                    <th className="px-3 py-2.5 font-medium" title="Stored fields on this node.">Properties</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((node) => {
                    const properties = Object.entries(node.properties);
                    return (
                      <tr key={node.elementId} className="border-b align-top last:border-0 hover:bg-accent/40">
                        <td className="max-w-xs px-5 py-3">
                          <div className="font-mono font-medium break-words">{node.display}</div>
                          <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{node.elementId}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {node.labels.map((item) => (
                              <Badge key={item} variant="outline" className={cn('font-mono', labelTone(item))}>
                                {item}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="secondary" className="font-mono">{node.incoming} in</Badge>
                            <Badge variant="secondary" className="font-mono">{node.outgoing} out</Badge>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="grid max-w-2xl gap-1.5">
                            {properties.length ? (
                              properties.slice(0, 8).map(([key, value]) => (
                                <div key={key} className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                                  <span className="break-words text-xs uppercase tracking-wide text-muted-foreground">{key}</span>
                                  <code className="break-words text-xs text-muted-foreground">{compactValue(value)}</code>
                                </div>
                              ))
                            ) : (
                              <span className="text-muted-foreground">No properties</span>
                            )}
                            {properties.length > 8 && (
                              <span className="text-xs text-muted-foreground">+{properties.length - 8} more</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5 text-sm text-muted-foreground">No nodes match this filter.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
        <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
