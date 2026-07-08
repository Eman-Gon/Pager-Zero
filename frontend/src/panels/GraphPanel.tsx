import neo4j from 'neo4j-driver';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Incident } from '../api';

const NEO4J_URL = process.env.NEXT_PUBLIC_NEO4J_URL ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEXT_PUBLIC_NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = process.env.NEXT_PUBLIC_NEO4J_PASSWORD ?? 'devpassword';

type NodeKind = 'function' | 'test';
type Source = 'neo4j' | 'incident' | 'none';
type NodeRole = 'root' | 'blast' | 'test' | 'function';

interface GNode {
  id: string;
  kind: NodeKind;
}
interface GLink {
  source: string;
  target: string;
  kind: 'CALLS' | 'TESTS';
}
interface Point {
  x: number;
  y: number;
}
interface Size {
  width: number;
  height: number;
}
interface ViewTransform {
  x: number;
  y: number;
  k: number;
}
interface DragState {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}
interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

const DEFAULT_SIZE: Size = { width: 680, height: 520 };
const DEFAULT_VIEW: ViewTransform = { x: 0, y: 0, k: 1 };
const MIN_ZOOM = 0.42;
const MAX_ZOOM = 2.6;

const COLOR = {
  root: '#ff5f7e',
  rootStroke: '#ffe0e7',
  blast: '#f4bf5f',
  blastStroke: '#ffe4ad',
  fn: '#e6e8ef',
  fnStroke: '#ffffff',
  test: '#6ea8fe',
  testStroke: '#d6e6ff',
  edge: '#526171',
  edgeStrong: '#ff7f98',
  testEdge: '#6ea8fe',
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const deg = (value: number) => (value * Math.PI) / 180;
const short = (id: string) =>
  id
    .replace(/^test\//, '')
    .replace(/^src\//, '')
    .replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '.$1')
    .replace(/\.(ts|tsx|js|jsx)$/, '');
const byLabel = (a: string, b: string) => short(a).localeCompare(short(b));

function unique(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean))).sort(byLabel);
}

function normalizeGraph(graph: { nodes: GNode[]; links: GLink[] }): { nodes: GNode[]; links: GLink[] } {
  const nodes = new Map<string, GNode>();
  for (const node of graph.nodes) {
    if (!node.id) continue;
    const existing = nodes.get(node.id);
    nodes.set(node.id, existing?.kind === 'function' ? existing : node);
  }

  const rels = new Map<string, GLink>();
  for (const link of graph.links) {
    if (!nodes.has(link.source) || !nodes.has(link.target) || link.source === link.target) continue;
    rels.set(`${link.source}->${link.target}:${link.kind}`, link);
  }

  return {
    nodes: Array.from(nodes.values()).sort((a, b) => byLabel(a.id, b.id)),
    links: Array.from(rels.values()).sort((a, b) => `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`)),
  };
}

// Live code graph from Neo4j (browser bolt-over-websocket). If Neo4j isn't
// reachable, fall back to the subgraph named by the incident.
async function loadGraph(): Promise<{ nodes: GNode[]; links: GLink[] }> {
  const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  try {
    const session = driver.session();
    try {
      const fns = await session.run(`MATCH (f:Function) RETURN f.name AS name`);
      const calls = await session.run(`MATCH (a:Function)-[:CALLS]->(b:Function) RETURN a.name AS a, b.name AS b`);
      const tests = await session.run(`MATCH (t:Test)-[:TESTS]->(f:Function) RETURN t.file AS t, f.name AS f`);
      const nodes: GNode[] = fns.records.map((r) => ({ id: r.get('name'), kind: 'function' }));
      for (const r of tests.records) nodes.push({ id: r.get('t'), kind: 'test' });
      const links: GLink[] = [
        ...calls.records.map((r) => ({ source: r.get('a'), target: r.get('b'), kind: 'CALLS' as const })),
        ...tests.records.map((r) => ({ source: r.get('t'), target: r.get('f'), kind: 'TESTS' as const })),
      ];
      return normalizeGraph({ nodes, links });
    } finally {
      await session.close();
    }
  } finally {
    await driver.close();
  }
}

function fallbackGraph(incident: Incident): { nodes: GNode[]; links: GLink[] } {
  const nodes: GNode[] = [
    ...(incident.root_cause ? [{ id: incident.root_cause, kind: 'function' as const }] : []),
    ...incident.blast_radius.map((id) => ({ id, kind: 'function' as const })),
    ...incident.failing_tests.map((id) => ({ id, kind: 'test' as const })),
  ];
  const links: GLink[] = incident.root_cause
    ? [
        ...incident.blast_radius.map((id) => ({ source: id, target: incident.root_cause!, kind: 'CALLS' as const })),
        ...incident.failing_tests.map((id) => ({ source: id, target: incident.root_cause!, kind: 'TESTS' as const })),
      ]
    : [];
  return normalizeGraph({ nodes, links });
}

function placeColumn(ids: string[], x: number, minY: number, maxY: number, positions: Record<string, Point>, placed: Set<string>) {
  if (!ids.length) return;
  const span = Math.max(1, maxY - minY);
  ids.forEach((id, index) => {
    const y = ids.length === 1 ? minY + span / 2 : minY + (span * index) / (ids.length - 1);
    positions[id] = { x, y };
    placed.add(id);
  });
}

function placeArc(
  ids: string[],
  center: Point,
  rx: number,
  ry: number,
  startDeg: number,
  endDeg: number,
  positions: Record<string, Point>,
  placed: Set<string>,
) {
  if (!ids.length) return;
  ids.forEach((id, index) => {
    const t = ids.length === 1 ? 0.5 : index / (ids.length - 1);
    const angle = deg(startDeg + (endDeg - startDeg) * t);
    positions[id] = {
      x: center.x + Math.cos(angle) * rx,
      y: center.y + Math.sin(angle) * ry,
    };
    placed.add(id);
  });
}

function placeGrid(ids: string[], size: Size, positions: Record<string, Point>, placed: Set<string>, yStart: number) {
  if (!ids.length) return;
  const cols = clamp(Math.floor(size.width / 190), 2, 4);
  const rows = Math.ceil(ids.length / cols);
  const left = Math.max(82, size.width * 0.17);
  const right = Math.min(size.width - 82, size.width * 0.84);
  const xStep = cols === 1 ? 0 : (right - left) / (cols - 1);
  const availableH = Math.max(72, size.height - yStart - 88);
  const yStep = rows <= 1 ? 0 : Math.min(86, availableH / (rows - 1));

  ids.forEach((id, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    positions[id] = {
      x: cols === 1 ? size.width / 2 : left + col * xStep,
      y: rows === 1 ? yStart + availableH / 2 : yStart + row * yStep,
    };
    placed.add(id);
  });
}

function computeLayout(graph: { nodes: GNode[]; links: GLink[] }, root: string | null, blast: Set<string>, size: Size) {
  const positions: Record<string, Point> = {};
  const placed = new Set<string>();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const rootId = root && nodeById.has(root) ? root : null;

  if (!graph.nodes.length) return positions;

  if (!rootId) {
    const ids = graph.nodes.map((node) => node.id).sort(byLabel);
    const center = { x: size.width / 2, y: size.height / 2 };
    const innerCount = ids.length > 12 ? Math.ceil(ids.length * 0.42) : ids.length;
    const inner = ids.slice(0, innerCount);
    const outer = ids.slice(innerCount);
    placeArc(inner, center, Math.min(220, size.width * 0.29), Math.min(170, size.height * 0.28), -170, 170, positions, placed);
    placeArc(outer, center, Math.min(320, size.width * 0.39), Math.min(230, size.height * 0.38), -160, 160, positions, placed);
    return positions;
  }

  const rootPoint = { x: size.width * 0.54, y: size.height * 0.4 };
  positions[rootId] = rootPoint;
  placed.add(rootId);

  const tests = graph.nodes.filter((node) => node.kind === 'test').map((node) => node.id);
  const callers = graph.links
    .filter((link) => link.target === rootId)
    .map((link) => link.source)
    .filter((id) => nodeById.get(id)?.kind === 'function');
  const callees = graph.links
    .filter((link) => link.source === rootId)
    .map((link) => link.target)
    .filter((id) => nodeById.get(id)?.kind === 'function');
  const blastFns = graph.nodes
    .filter((node) => node.kind === 'function' && node.id !== rootId && blast.has(node.id))
    .map((node) => node.id);

  placeColumn(
    unique(tests),
    Math.max(82, size.width * 0.18),
    Math.max(98, rootPoint.y - 150),
    Math.min(size.height - 104, rootPoint.y + 150),
    positions,
    placed,
  );

  const blastNearRoot = unique([...blastFns, ...callers.filter((id) => blast.has(id)), ...callees.filter((id) => blast.has(id))]).filter(
    (id) => !placed.has(id),
  );
  placeArc(
    blastNearRoot,
    rootPoint,
    Math.min(210, size.width * 0.24),
    Math.min(150, size.height * 0.24),
    35,
    145,
    positions,
    placed,
  );

  placeColumn(
    unique(callers).filter((id) => !placed.has(id)),
    Math.max(180, size.width * 0.34),
    Math.max(100, rootPoint.y - 150),
    Math.min(size.height - 106, rootPoint.y + 150),
    positions,
    placed,
  );

  placeColumn(
    unique(callees).filter((id) => !placed.has(id)),
    Math.min(size.width - 96, size.width * 0.79),
    Math.max(100, rootPoint.y - 145),
    Math.min(size.height - 106, rootPoint.y + 145),
    positions,
    placed,
  );

  const remaining = graph.nodes
    .map((node) => node.id)
    .filter((id) => !placed.has(id))
    .sort(byLabel);
  placeGrid(remaining, size, positions, placed, Math.max(size.height * 0.68, rootPoint.y + 170));

  return positions;
}

function nodeRole(node: GNode, root: string | null, blast: Set<string>): NodeRole {
  if (node.id === root) return 'root';
  if (blast.has(node.id)) return 'blast';
  return node.kind === 'test' ? 'test' : 'function';
}

function nodeRadius(role: NodeRole) {
  if (role === 'root') return 34;
  if (role === 'blast') return 26;
  if (role === 'test') return 22;
  return 23;
}

function nodeFill(role: NodeRole) {
  if (role === 'root') return COLOR.root;
  if (role === 'blast') return COLOR.blast;
  if (role === 'test') return COLOR.test;
  return COLOR.fn;
}

function nodeStroke(role: NodeRole) {
  if (role === 'root') return COLOR.rootStroke;
  if (role === 'blast') return COLOR.blastStroke;
  if (role === 'test') return COLOR.testStroke;
  return COLOR.fnStroke;
}

function labelLines(id: string, role: NodeRole) {
  const max = role === 'root' ? 15 : 18;
  const words = short(id)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .split(/[ /]+/)
    .filter(Boolean);
  const lines: string[] = [];

  for (const word of words) {
    if (!lines.length || `${lines[lines.length - 1]} ${word}`.length > max) {
      lines.push(word.length > max ? `${word.slice(0, max - 1)}…` : word);
    } else {
      lines[lines.length - 1] = `${lines[lines.length - 1]} ${word}`;
    }
    if (lines.length === 2) break;
  }

  return lines.length ? lines : [short(id).slice(0, max)];
}

function edgePath(source: Point, target: Point, sourceRadius: number, targetRadius: number) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const sx = source.x + (dx / length) * (sourceRadius + 3);
  const sy = source.y + (dy / length) * (sourceRadius + 3);
  const tx = target.x - (dx / length) * (targetRadius + 8);
  const ty = target.y - (dy / length) * (targetRadius + 8);
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`;
}

export default function GraphPanel({ incident }: { incident: Incident | null }) {
  const [graph, setGraph] = useState<{ nodes: GNode[]; links: GLink[] }>({ nodes: [], links: [] });
  const [source, setSource] = useState<Source>('none');
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [view, setView] = useState<ViewTransform>(DEFAULT_VIEW);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewRef = useRef<ViewTransform>(view);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);

  useEffect(() => {
    let alive = true;
    loadGraph()
      .then((g) => {
        if (!alive) return;
        setGraph(g);
        setSource('neo4j');
      })
      .catch(() => {
        if (!alive) return;
        if (incident?.status === 'incident' && incident.root_cause) {
          setGraph(fallbackGraph(incident));
          setSource('incident');
        } else {
          setGraph({ nodes: [], links: [] });
          setSource('none');
        }
      });
    return () => {
      alive = false;
    };
  }, [incident?.status, incident?.root_cause]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(280, Math.round(rect.height)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const root = incident?.status === 'incident' ? incident.root_cause : null;
  const blast = useMemo(
    () => new Set(incident?.status === 'incident' ? incident.blast_radius : []),
    [incident?.status, incident?.root_cause, incident?.blast_radius],
  );
  const blastKey = useMemo(() => Array.from(blast).sort(byLabel).join('|'), [blast]);
  const graphKey = useMemo(
    () =>
      `${graph.nodes.map((node) => `${node.id}:${node.kind}`).join('|')}::${graph.links
        .map((link) => `${link.source}>${link.target}:${link.kind}`)
        .join('|')}`,
    [graph.nodes, graph.links],
  );
  const autoLayout = useMemo(() => computeLayout(graph, root, blast, size), [graph, root, blastKey, graphKey, size.width, size.height]);

  useEffect(() => {
    setPositions(autoLayout);
    setView(DEFAULT_VIEW);
    setSelectedId(root);
  }, [autoLayout, root]);

  const selectedNode = useMemo(() => graph.nodes.find((node) => node.id === selectedId) ?? null, [graph.nodes, selectedId]);

  const pointFor = useCallback(
    (id: string) => positions[id] ?? autoLayout[id] ?? { x: size.width / 2, y: size.height / 2 },
    [positions, autoLayout, size.width, size.height],
  );

  const clientToWorld = useCallback((clientX: number, clientY: number, transform = viewRef.current): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - transform.x) / transform.k,
      y: (clientY - rect.top - transform.y) / transform.k,
    };
  }, []);

  const resetLayout = useCallback(() => {
    setPositions(autoLayout);
    setView(DEFAULT_VIEW);
    setSelectedId(root);
  }, [autoLayout, root]);

  const fitGraph = useCallback(() => {
    const points = graph.nodes.map((node) => pointFor(node.id));
    if (!points.length) return;

    const minX = Math.min(...points.map((point) => point.x)) - 120;
    const maxX = Math.max(...points.map((point) => point.x)) + 120;
    const minY = Math.min(...points.map((point) => point.y)) - 112;
    const maxY = Math.max(...points.map((point) => point.y)) + 112;
    const nextK = clamp(Math.min(size.width / (maxX - minX), size.height / (maxY - minY)), MIN_ZOOM, 1.32);
    setView({
      k: nextK,
      x: size.width / 2 - ((minX + maxX) / 2) * nextK,
      y: size.height / 2 - ((minY + maxY) / 2) * nextK,
    });
  }, [graph.nodes, pointFor, size.width, size.height]);

  const focusRoot = useCallback(() => {
    if (!root) return;
    const point = pointFor(root);
    setSelectedId(root);
    setView((current) => ({
      ...current,
      x: size.width / 2 - point.x * current.k,
      y: size.height / 2 - point.y * current.k,
    }));
  }, [pointFor, root, size.width, size.height]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      if (!graph.nodes.length) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const world = clientToWorld(event.clientX, event.clientY);
      const nextK = clamp(viewRef.current.k * Math.exp(-event.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM);
      setView({
        k: nextK,
        x: screenX - world.x * nextK,
        y: screenY - world.y * nextK,
      });
    },
    [clientToWorld, graph.nodes.length],
  );

  const handleNodePointerDown = useCallback(
    (event: React.PointerEvent<SVGGElement>, id: string) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const point = pointFor(id);
      const world = clientToWorld(event.clientX, event.clientY);
      dragRef.current = {
        id,
        pointerId: event.pointerId,
        offsetX: world.x - point.x,
        offsetY: world.y - point.y,
      };
      setSelectedId(id);
      setDraggingId(id);
      svgRef.current?.setPointerCapture(event.pointerId);
    },
    [clientToWorld, pointFor],
  );

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewRef.current.x,
      originY: viewRef.current.y,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (drag?.pointerId === event.pointerId) {
        const world = clientToWorld(event.clientX, event.clientY);
        setPositions((current) => ({
          ...current,
          [drag.id]: { x: world.x - drag.offsetX, y: world.y - drag.offsetY },
        }));
        return;
      }

      const pan = panRef.current;
      if (pan?.pointerId === event.pointerId) {
        setView((current) => ({
          ...current,
          x: pan.originX + event.clientX - pan.startX,
          y: pan.originY + event.clientY - pan.startY,
        }));
      }
    },
    [clientToWorld],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDraggingId(null);
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    try {
      svgRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer capture may already be released by the browser */
    }
  }, []);

  const visibleLinks = graph.links.filter((link) => (positions[link.source] ?? autoLayout[link.source]) && (positions[link.target] ?? autoLayout[link.target]));

  return (
    <div className="graph-panel" ref={containerRef}>
      {graph.nodes.length ? (
        <>
          <svg
            ref={svgRef}
            className={`graph-svg${draggingId ? ' is-dragging' : ''}`}
            aria-label="Code graph"
            width="100%"
            height="100%"
            viewBox={`0 0 ${size.width} ${size.height}`}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <defs>
              <marker id="graph-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,3 L0,6 Z" fill={COLOR.edge} />
              </marker>
              <marker id="graph-arrow-hot" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,3 L0,6 Z" fill={COLOR.edgeStrong} />
              </marker>
              <marker id="graph-arrow-test" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,3 L0,6 Z" fill={COLOR.testEdge} />
              </marker>
            </defs>
            <rect className="graph-hitarea" width={size.width} height={size.height} />
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              <g className="graph-links">
                {visibleLinks.map((link) => {
                  const sourceNode = graph.nodes.find((node) => node.id === link.source);
                  const targetNode = graph.nodes.find((node) => node.id === link.target);
                  if (!sourceNode || !targetNode) return null;
                  const sourceRole = nodeRole(sourceNode, root, blast);
                  const targetRole = nodeRole(targetNode, root, blast);
                  const isRootEdge = link.target === root || link.source === root;
                  const marker = link.kind === 'TESTS' ? 'url(#graph-arrow-test)' : isRootEdge ? 'url(#graph-arrow-hot)' : 'url(#graph-arrow)';
                  return (
                    <path
                      key={`${link.source}->${link.target}:${link.kind}`}
                      className={`graph-link graph-link-${link.kind.toLowerCase()}${isRootEdge ? ' graph-link-hot' : ''}`}
                      d={edgePath(pointFor(link.source), pointFor(link.target), nodeRadius(sourceRole), nodeRadius(targetRole))}
                      markerEnd={marker}
                    />
                  );
                })}
              </g>

              <g className="graph-nodes">
                {graph.nodes.map((node) => {
                  const point = pointFor(node.id);
                  const role = nodeRole(node, root, blast);
                  const radius = nodeRadius(role);
                  const lines = labelLines(node.id, role);
                  const fontSize = role === 'root' ? 12.5 : 11.5;
                  const labelWidth = clamp(Math.max(...lines.map((line) => line.length)) * fontSize * 0.58 + 20, 58, 150);
                  const labelHeight = lines.length * (fontSize + 3) + 9;
                  const active = selectedId === node.id;

                  return (
                    <g
                      key={node.id}
                      className={`graph-node graph-node-${role}${active ? ' is-selected' : ''}${draggingId === node.id ? ' is-dragged' : ''}`}
                      transform={`translate(${point.x} ${point.y})`}
                      onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                    >
                      <title>{node.id}</title>
                      <circle
                        r={radius}
                        fill={nodeFill(role)}
                        stroke={nodeStroke(role)}
                        strokeWidth={role === 'root' ? 3.5 : active ? 3 : 2}
                      />
                      {role === 'root' && <circle className="graph-root-ring" r={radius + 8} />}
                      <rect
                        className="graph-label-bg"
                        x={-labelWidth / 2}
                        y={radius + 10}
                        width={labelWidth}
                        height={labelHeight}
                        rx="6"
                      />
                      <text className="graph-label" y={radius + 10 + 14} textAnchor="middle" fontSize={fontSize}>
                        {lines.map((line, index) => (
                          <tspan key={`${line}-${index}`} x="0" dy={index === 0 ? 0 : fontSize + 3}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>

          <div className="graph-toolbar" aria-label="Graph controls">
            <button type="button" onClick={fitGraph}>
              Fit
            </button>
            <button type="button" onClick={focusRoot} disabled={!root}>
              Root
            </button>
            <button type="button" onClick={resetLayout}>
              Layout
            </button>
          </div>

          <div className="graph-meta">
            <div className="graph-legend">
              <span className="graph-key graph-key-root">root</span>
              <span className="graph-key graph-key-blast">blast</span>
              <span className="graph-key graph-key-test">test</span>
              <span className="graph-key graph-key-function">function</span>
            </div>
            <div className="graph-source">
              {source === 'neo4j' ? 'live neo4j graph' : source === 'incident' ? 'incident subgraph' : 'no graph data'}
            </div>
          </div>

          {selectedNode && (
            <div className="graph-selection">
              <span>{nodeRole(selectedNode, root, blast).replace('function', 'fn')}</span>
              <strong>{short(selectedNode.id)}</strong>
            </div>
          )}
        </>
      ) : (
        <div className="muted graph-empty">no graph data</div>
      )}
    </div>
  );
}
