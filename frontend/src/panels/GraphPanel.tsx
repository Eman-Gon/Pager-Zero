import type NVL from '@neo4j-nvl/base';
import type { Node as NvlNode, Relationship as NvlRel } from '@neo4j-nvl/base';
import { InteractiveNvlWrapper } from '@neo4j-nvl/react';
import neo4j from 'neo4j-driver';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Incident } from '../api';

const NEO4J_URL = import.meta.env.VITE_NEO4J_URL ?? 'bolt://localhost:7687';
const NEO4J_USER = import.meta.env.VITE_NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = import.meta.env.VITE_NEO4J_PASSWORD ?? 'devpassword';

interface GNode {
  id: string;
  kind: 'function' | 'test';
}
interface GLink {
  source: string;
  target: string;
  kind: 'CALLS' | 'TESTS';
}

// Live code graph from Neo4j (browser bolt-over-websocket). If Neo4j isn't
// reachable (e.g. the deployed URL), fall back to the subgraph named by the
// incident — still real sensor data, never mocked.
async function loadGraph(): Promise<{ nodes: GNode[]; links: GLink[] }> {
  const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  try {
    const session = driver.session();
    try {
      const fns = await session.run(`MATCH (f:Function) RETURN f.name AS name`);
      const calls = await session.run(`MATCH (a:Function)-[:CALLS]->(b:Function) RETURN a.name AS a, b.name AS b`);
      const tests = await session.run(`MATCH (t:Test)-[:TESTS]->(f:Function) RETURN t.file AS t, f.name AS f`);
      const nodes: GNode[] = fns.records.map((r) => ({ id: r.get('name'), kind: 'function' }));
      for (const r of tests.records) {
        if (!nodes.some((n) => n.id === r.get('t'))) nodes.push({ id: r.get('t'), kind: 'test' });
      }
      const links: GLink[] = [
        ...calls.records.map((r) => ({ source: r.get('a'), target: r.get('b'), kind: 'CALLS' as const })),
        ...tests.records.map((r) => ({ source: r.get('t'), target: r.get('f'), kind: 'TESTS' as const })),
      ];
      return { nodes, links };
    } finally {
      await session.close();
    }
  } finally {
    await driver.close();
  }
}

const COLOR = {
  root: '#ef5f5f',
  blast: '#f0b429',
  fn: '#4ea1ff',
  test: '#5b7089',
  calls: '#3b506e',
  tests: '#2d3c52',
} as const;

const short = (id: string) => id.replace('test/', '');

export default function GraphPanel({ incident }: { incident: Incident | null }) {
  const [graph, setGraph] = useState<{ nodes: GNode[]; links: GLink[] }>({ nodes: [], links: [] });
  const [source, setSource] = useState<'neo4j' | 'incident' | 'none'>('none');
  const nvlRef = useRef<NVL | null>(null);

  useEffect(() => {
    let alive = true;
    loadGraph()
      .then((g) => alive && (setGraph(g), setSource('neo4j')))
      .catch(() => {
        if (!alive) return;
        if (incident?.status === 'incident' && incident.root_cause) {
          const nodes: GNode[] = [
            { id: incident.root_cause, kind: 'function' },
            ...incident.blast_radius.map((f) => ({ id: f, kind: 'function' as const })),
            ...incident.failing_tests.map((t) => ({ id: t, kind: 'test' as const })),
          ];
          const links: GLink[] = [
            ...incident.blast_radius.map((f) => ({ source: f, target: incident.root_cause!, kind: 'CALLS' as const })),
            ...incident.failing_tests.map((t) => ({ source: t, target: incident.root_cause!, kind: 'TESTS' as const })),
          ];
          setGraph({ nodes, links });
          setSource('incident');
        } else {
          setSource('none');
        }
      });
    return () => {
      alive = false;
    };
    // re-load when incident identity changes (break/reset re-scans the graph)
  }, [incident?.status, incident?.root_cause]);

  const root = incident?.status === 'incident' ? incident.root_cause : null;
  const blast = useMemo(
    () => new Set(incident?.status === 'incident' ? incident.blast_radius : []),
    [incident?.status, incident?.root_cause, incident?.blast_radius],
  );

  // Map the code graph into NVL's Node/Relationship model. Colour + size encode
  // the incident: root_cause is red and largest, the blast radius amber, other
  // functions blue, test files muted. Recomputed whenever the incident changes.
  const nodes: NvlNode[] = useMemo(
    () =>
      graph.nodes.map((n) => {
        const isRoot = n.id === root;
        const inBlast = blast.has(n.id);
        const color = isRoot ? COLOR.root : inBlast ? COLOR.blast : n.kind === 'test' ? COLOR.test : COLOR.fn;
        const size = isRoot ? 42 : inBlast ? 30 : n.kind === 'test' ? 18 : 24;
        return {
          id: n.id,
          caption: short(n.id),
          color,
          size,
          captionAlign: 'bottom',
          captionSize: isRoot ? 3 : 2,
          selected: isRoot,
        };
      }),
    [graph.nodes, root, blast],
  );

  const rels: NvlRel[] = useMemo(
    () =>
      graph.links.map((l) => ({
        id: `${l.source}->${l.target}:${l.kind}`,
        from: l.source,
        to: l.target,
        color: l.kind === 'TESTS' ? COLOR.tests : COLOR.calls,
        // Emphasise the edges that flow into the root cause (the blast radius).
        width: root && l.target === root ? 3 : 1,
      })),
    [graph.links, root],
  );

  // Fit the whole graph into view once it (re)loads.
  useEffect(() => {
    if (!nodes.length) return;
    const t = setTimeout(() => nvlRef.current?.fit?.(nodes.map((n) => n.id), {}), 300);
    return () => clearTimeout(t);
  }, [nodes]);

  return (
    <div style={{ position: 'absolute', inset: 6 }}>
      {nodes.length ? (
        <InteractiveNvlWrapper
          ref={nvlRef}
          nodes={nodes}
          rels={rels}
          layout="forceDirected"
          nvlOptions={{
            // Canvas renderer: NVL only draws captions + arrowheads off WebGL.
            disableWebGL: true,
            initialZoom: 1,
            minZoom: 0.15,
            maxZoom: 3,
          }}
          style={{ width: '100%', height: '100%', background: 'transparent' }}
        />
      ) : (
        <div className="muted" style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 12 }}>
          no graph data
        </div>
      )}
      <div className="muted" style={{ position: 'absolute', bottom: 4, right: 8, fontSize: 11 }}>
        {source === 'neo4j' ? 'live neo4j graph · NVL' : source === 'incident' ? 'incident subgraph · NVL (neo4j unreachable)' : 'no graph data'}
      </div>
    </div>
  );
}
