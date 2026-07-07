import neo4j from 'neo4j-driver';
import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
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

export default function GraphPanel({ incident }: { incident: Incident | null }) {
  const [graph, setGraph] = useState<{ nodes: GNode[]; links: GLink[] }>({ nodes: [], links: [] });
  const [source, setSource] = useState<'neo4j' | 'incident' | 'none'>('none');
  const holder = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 460 });

  useEffect(() => {
    const measure = () =>
      holder.current && setSize({ w: holder.current.clientWidth, h: holder.current.clientHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

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
  const blast = new Set(incident?.status === 'incident' ? incident.blast_radius : []);

  return (
    <div ref={holder} style={{ position: 'absolute', inset: 6 }}>
      <ForceGraph2D
        width={size.w}
        height={size.h}
        graphData={graph}
        backgroundColor="rgba(0,0,0,0)"
        nodeLabel={(n: any) => n.id}
        nodeColor={(n: any) =>
          n.id === root ? '#ef5f5f' : blast.has(n.id) ? '#f0b429' : n.kind === 'test' ? '#5b7089' : '#4ea1ff'
        }
        nodeVal={(n: any) => (n.id === root ? 10 : blast.has(n.id) ? 6 : 3)}
        linkColor={(l: any) => (l.kind === 'TESTS' ? '#2d3c52' : '#3b506e')}
        linkDirectionalArrowLength={4}
        linkDirectionalParticles={(l: any) =>
          root && (l.target?.id === root || l.target === root) ? 2 : 0
        }
        nodeCanvasObjectMode={() => 'after'}
        nodeCanvasObject={(n: any, ctx, scale) => {
          ctx.font = `${11 / scale}px monospace`;
          ctx.fillStyle = n.id === root ? '#ef5f5f' : blast.has(n.id) ? '#f0b429' : '#7f93ab';
          ctx.textAlign = 'center';
          ctx.fillText(n.id.replace('test/', ''), n.x, n.y - 8 / scale);
        }}
      />
      <div className="muted" style={{ position: 'absolute', bottom: 4, right: 8, fontSize: 11 }}>
        {source === 'neo4j' ? 'live neo4j graph' : source === 'incident' ? 'incident subgraph (neo4j unreachable)' : 'no graph data'}
      </div>
    </div>
  );
}
