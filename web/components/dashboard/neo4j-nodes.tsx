'use client';

import * as React from 'react';
import { GitBranch, Move, RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface NodeRow {
  elementId: string;
  display: string;
  labels: string[];
  properties: Record<string, unknown>;
  incoming: number;
  outgoing: number;
}
interface Rel {
  source: string;
  target: string;
  type: string;
}
interface Payload {
  nodes: NodeRow[];
  relationships: Rel[];
  error?: string;
}
type Point = { x: number; y: number };

const W = 820;
const H = 520;

function labelColor(label?: string): string {
  switch ((label ?? '').toLowerCase()) {
    case 'function':
      return '#2dd4bf';
    case 'test':
      return '#38bdf8';
    case 'runbook':
      return '#fbbf24';
    default:
      return '#94a3b8';
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Simple, stable circle layout — nodes are draggable from here.
function circleLayout(nodes: NodeRow[]): Record<string, Point> {
  const out: Record<string, Point> = {};
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) * 0.37;
  nodes.forEach((node, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    out[node.elementId] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  return out;
}

export function Neo4jNodes() {
  const [nodes, setNodes] = React.useState<NodeRow[]>([]);
  const [edges, setEdges] = React.useState<Rel[]>([]);
  const [pos, setPos] = React.useState<Record<string, Point>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [diff, setDiff] = React.useState<{ file: string; name: string } | null>(null);

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const drag = React.useRef<{ id: string; offX: number; offY: number; sx: number; sy: number; moved: boolean } | null>(
    null,
  );

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/neo4j/nodes?limit=200', { signal: controller.signal, cache: 'no-store' })
      .then(async (res) => {
        const payload = (await res.json()) as Payload;
        if (!res.ok) throw new Error(payload.error ?? `Neo4j request failed (${res.status})`);
        const ns = payload.nodes ?? [];
        setNodes(ns);
        setEdges(payload.relationships ?? []);
        setPos(circleLayout(ns));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setNodes([]);
        setEdges([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshKey]);

  const toSvg = React.useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const onNodeDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const c = toSvg(e.clientX, e.clientY);
    const p = pos[id] ?? { x: c.x, y: c.y };
    drag.current = { id, offX: c.x - p.x, offY: c.y - p.y, sx: c.x, sy: c.y, moved: false };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const c = toSvg(e.clientX, e.clientY);
    if (Math.hypot(c.x - d.sx, c.y - d.sy) > 3) d.moved = true;
    setPos((prev) => ({ ...prev, [d.id]: { x: clamp(c.x - d.offX, 26, W - 26), y: clamp(c.y - d.offY, 26, H - 26) } }));
  };

  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) setSelectedId((cur) => (cur === d.id ? null : d.id)); // a click (not a drag) selects
    drag.current = null;
  };

  const selected = selectedId ? nodes.find((n) => n.elementId === selectedId) ?? null : null;
  const selectedFile =
    selected && typeof selected.properties.file === 'string' ? (selected.properties.file as string) : null;
  const isFunction = selected?.labels.some((l) => l.toLowerCase() === 'function') ?? false;
  const selectedBroken = selected
    ? selected.properties.status === 'failing' || selected.properties.changed === true
    : false;

  const labelsPresent = Array.from(new Set(nodes.flatMap((n) => n.labels)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading graph…' : `${nodes.length} nodes · ${edges.length} relationships`}
          <span className="ml-2 inline-flex items-center gap-1 text-xs">
            <Move className="size-3.5" /> drag to move · click for details
          </span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading}
          onClick={() => setRefreshKey((key) => key + 1)}
        >
          <RefreshCcw className={cn('size-4', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="p-5 text-sm text-destructive">{error}</div>
          ) : loading ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="relative border-b lg:border-b-0 lg:border-r">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${W} ${H}`}
                  className="h-[440px] w-full touch-none select-none sm:h-[520px]"
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerLeave={onUp}
                  onPointerDown={() => setSelectedId(null)}
                >
                  <g stroke="currentColor" className="text-border">
                    {edges.map((edge, i) => {
                      const a = pos[edge.source];
                      const b = pos[edge.target];
                      if (!a || !b) return null;
                      const active = selectedId ? edge.source === selectedId || edge.target === selectedId : false;
                      return (
                        <line
                          key={`${edge.source}-${edge.target}-${i}`}
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          strokeWidth={active ? 2 : 1.25}
                          opacity={selectedId && !active ? 0.15 : 0.55}
                        />
                      );
                    })}
                  </g>
                  {nodes.map((node) => {
                    const p = pos[node.elementId];
                    if (!p) return null;
                    const color = labelColor(node.labels[0]);
                    const isSelected = node.elementId === selectedId;
                    const dim = selectedId && !isSelected;
                    const r = 11 + Math.min(9, node.incoming + node.outgoing);
                    return (
                      <g
                        key={node.elementId}
                        transform={`translate(${p.x} ${p.y})`}
                        className="cursor-grab active:cursor-grabbing"
                        opacity={dim ? 0.3 : 1}
                        onPointerDown={(e) => onNodeDown(e, node.elementId)}
                      >
                        <circle
                          r={r}
                          fill={color}
                          fillOpacity={0.9}
                          stroke={isSelected ? 'currentColor' : color}
                          strokeWidth={isSelected ? 3 : 1.5}
                          className={isSelected ? 'text-foreground' : ''}
                        />
                        <text y={r + 13} textAnchor="middle" className="fill-foreground" fontSize={11} stroke="none">
                          {node.display.length > 20 ? `${node.display.slice(0, 19)}…` : node.display}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
                  {labelsPresent.map((label) => (
                    <span
                      key={label}
                      className="flex items-center gap-1.5 rounded-full border bg-background/80 px-2 py-0.5 text-xs backdrop-blur"
                    >
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: labelColor(label) }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-4">
                {selected ? (
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="break-words font-mono text-sm font-medium">{selected.display}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {selected.labels.map((l) => (
                          <Badge
                            key={l}
                            variant="outline"
                            style={{ borderColor: `${labelColor(l)}55`, color: labelColor(l) }}
                            className="font-mono"
                          >
                            {l}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <dl className="grid gap-2 text-sm">
                      {selectedFile && (
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-muted-foreground">File</dt>
                          <dd className="truncate font-mono text-xs">{selectedFile}</dd>
                        </div>
                      )}
                      {isFunction && (
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-muted-foreground">Status</dt>
                          <dd>
                            <Badge
                              variant="outline"
                              className={cn(
                                selectedBroken
                                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                  : 'border-success/25 bg-success/10 text-success',
                              )}
                            >
                              {selectedBroken ? 'Broken' : 'Healthy'}
                            </Badge>
                          </dd>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">Connections</dt>
                        <dd className="font-mono text-xs">
                          {selected.incoming} in · {selected.outgoing} out
                        </dd>
                      </div>
                    </dl>

                    {selectedFile && (
                      <Button
                        type="button"
                        size="sm"
                        className="mt-1 gap-2"
                        onClick={() => setDiff({ file: selectedFile, name: selected.display })}
                      >
                        <GitBranch className="size-4" /> Compare broken vs fixed
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                    <Move className="size-5" />
                    <p>Drag a node to move it. Click a node to see its details.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={diff != null}
        onOpenChange={(open) => {
          if (!open) setDiff(null);
        }}
      >
        <DialogContent className="max-h-[88vh] w-[94vw] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="size-4" /> Broken vs fixed{diff ? ` — ${diff.name}` : ''}
            </DialogTitle>
          </DialogHeader>
          {diff && <SourceDiff file={diff.file} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DiffColumn({
  title,
  tone,
  code,
  changed,
}: {
  title: string;
  tone: 'broken' | 'fixed';
  code: string | null;
  changed: Set<number>;
}) {
  const lines = (code ?? '').split('\n');
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border">
      <div
        className={cn(
          'border-b px-3 py-1.5 text-xs font-medium',
          tone === 'broken' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
        )}
      >
        {title}
      </div>
      {code == null ? (
        <div className="p-3 text-xs text-muted-foreground">Not available.</div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <pre className="min-w-max text-xs leading-5">
            {lines.map((line, i) => (
              <div
                key={i}
                className={cn('flex', changed.has(i) && (tone === 'broken' ? 'bg-destructive/15' : 'bg-success/15'))}
              >
                <span className="w-9 shrink-0 select-none px-2 text-right text-muted-foreground/60">{i + 1}</span>
                <code className="whitespace-pre px-2">{line || ' '}</code>
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

function SourceDiff({ file }: { file: string }) {
  const [data, setData] = React.useState<{ broken: string | null; fixed: string | null; identical: boolean } | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/source?file=${encodeURIComponent(file)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (res) => {
        const payload = (await res.json()) as {
          broken: string | null;
          fixed: string | null;
          identical: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(payload.error ?? `Source request failed (${res.status})`);
        setData(payload);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [file]);

  const changed = React.useMemo(() => {
    const set = new Set<number>();
    if (!data) return set;
    const a = (data.broken ?? '').split('\n');
    const b = (data.fixed ?? '').split('\n');
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if ((a[i] ?? '') !== (b[i] ?? '')) set.add(i);
    }
    return set;
  }, [data]);

  return (
    <div className="flex flex-col gap-3">
      <code className="w-fit rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{file}</code>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading source…</div>
      ) : error ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : data?.identical ? (
        <div className="rounded-lg border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">
          This file matches the clean baseline — no bug in this function right now. Click “Break production” to inject one.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <DiffColumn title="Broken · current target-repo" tone="broken" code={data?.broken ?? null} changed={changed} />
          <DiffColumn title="Fixed · good baseline" tone="fixed" code={data?.fixed ?? null} changed={changed} />
        </div>
      )}
    </div>
  );
}
