import neo4j from 'neo4j-driver';
import { useEffect, useMemo, useState } from 'react';

const NEO4J_URL = process.env.NEXT_PUBLIC_NEO4J_URL ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEXT_PUBLIC_NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = process.env.NEXT_PUBLIC_NEO4J_PASSWORD ?? 'devpassword';
const NODE_LIMIT = 200;

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

interface Neo4jNodesData {
  nodes: Neo4jNodeRow[];
  labels: LabelCount[];
  total: number;
}

function numberValue(value: unknown): number {
  if (neo4j.isInt(value)) return value.toNumber();
  return Number(value ?? 0);
}

function cleanProperty(value: unknown): PropertyValue {
  if (neo4j.isInt(value)) return value.toString();
  if (Array.isArray(value)) return value.map(cleanProperty);
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, cleanProperty(nested)]),
    );
  }
  return String(value);
}

function cleanProperties(value: unknown): Record<string, PropertyValue> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, cleanProperty(nested)]),
  );
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

async function loadNeo4jNodes(label: string): Promise<Neo4jNodesData> {
  const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  try {
    const session = driver.session();
    try {
      const labelResult = await session.run(`
        MATCH (n)
        UNWIND labels(n) AS label
        RETURN label, count(*) AS count
        ORDER BY count DESC, label ASC
      `);
      const totalResult = await session.run(`MATCH (n) RETURN count(n) AS total`);

      const nodeResult = await session.run(
        `
        MATCH (n)
        WHERE $label = '' OR $label IN labels(n)
        WITH n
        OPTIONAL MATCH (n)-[out]->()
        WITH n, count(out) AS outgoing
        OPTIONAL MATCH ()-[in]->(n)
        WITH n, outgoing, count(in) AS incoming, labels(n) AS nodeLabels, properties(n) AS props
        RETURN
          elementId(n) AS elementId,
          toString(coalesce(n.name, n.file, n.title, n.id, elementId(n))) AS display,
          nodeLabels AS labels,
          props,
          outgoing,
          incoming
        ORDER BY nodeLabels[0], display
        LIMIT $limit
        `,
        { label, limit: neo4j.int(NODE_LIMIT) },
      );

      return {
        total: numberValue(totalResult.records[0]?.get('total')),
        labels: labelResult.records.map((record) => ({
          label: record.get('label'),
          count: numberValue(record.get('count')),
        })),
        nodes: nodeResult.records.map((record) => ({
          elementId: record.get('elementId'),
          display: record.get('display'),
          labels: record.get('labels'),
          properties: cleanProperties(record.get('props')),
          incoming: numberValue(record.get('incoming')),
          outgoing: numberValue(record.get('outgoing')),
        })),
      };
    } finally {
      await session.close();
    }
  } finally {
    await driver.close();
  }
}

function labelClass(label: string): string {
  return `node-label node-label-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export default function Neo4jNodesScreen() {
  const [selectedLabel, setSelectedLabel] = useState('');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Neo4jNodesData>({ nodes: [], labels: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadNeo4jNodes(selectedLabel)
      .then((next) => {
        if (!alive) return;
        setData(next);
      })
      .catch((err) => {
        if (!alive) return;
        setData({ nodes: [], labels: [], total: 0 });
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedLabel, reloadKey]);

  const visibleNodes = useMemo(() => data.nodes.filter((node) => matchesQuery(node, query)), [data.nodes, query]);
  const relationshipCount = visibleNodes.reduce((sum, node) => sum + node.incoming + node.outgoing, 0);

  return (
    <main className="nodes-screen">
      <div className="nodes-head">
        <div>
          <div className="screen-kicker">Neo4j</div>
          <h2>Nodes</h2>
        </div>
        <button type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="nodes-summary">
        <div className="nodes-metric">
          <span>nodes</span>
          <strong>{data.total}</strong>
        </div>
        <div className="nodes-metric">
          <span>visible</span>
          <strong>{visibleNodes.length}</strong>
        </div>
        <div className="nodes-metric">
          <span>labels</span>
          <strong>{data.labels.length}</strong>
        </div>
        <div className="nodes-metric">
          <span>degree</span>
          <strong>{relationshipCount}</strong>
        </div>
      </div>

      <div className="nodes-controls">
        <div className="nodes-label-filter" aria-label="Node label filters">
          <button type="button" className={selectedLabel === '' ? 'active' : ''} onClick={() => setSelectedLabel('')}>
            All
          </button>
          {data.labels.map((item) => (
            <button
              type="button"
              key={item.label}
              className={selectedLabel === item.label ? 'active' : ''}
              onClick={() => setSelectedLabel(item.label)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
        <input
          className="nodes-search"
          aria-label="Search nodes"
          placeholder="Search nodes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="nodes-table-wrap">
        {error ? (
          <div className="nodes-state err">{error}</div>
        ) : loading ? (
          <div className="nodes-state">
            <span className="spinner" />
            <span>Loading nodes...</span>
          </div>
        ) : visibleNodes.length ? (
          <table className="nodes-table">
            <thead>
              <tr>
                <th>Node</th>
                <th>Labels</th>
                <th>Degree</th>
                <th>Properties</th>
              </tr>
            </thead>
            <tbody>
              {visibleNodes.map((node) => {
                const properties = Object.entries(node.properties);
                return (
                  <tr key={node.elementId}>
                    <td className="nodes-primary">
                      <code>{node.display}</code>
                      <span>{node.elementId}</span>
                    </td>
                    <td>
                      <div className="node-labels">
                        {node.labels.map((label) => (
                          <span key={label} className={labelClass(label)}>
                            {label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="nodes-degree">
                        <span>{node.incoming} in</span>
                        <span>{node.outgoing} out</span>
                      </div>
                    </td>
                    <td>
                      <div className="node-props">
                        {properties.length ? (
                          properties.slice(0, 8).map(([key, value]) => (
                            <div key={key} className="node-prop">
                              <span>{key}</span>
                              <code>{compactValue(value)}</code>
                            </div>
                          ))
                        ) : (
                          <span className="muted">none</span>
                        )}
                        {properties.length > 8 && <span className="muted">+{properties.length - 8} more</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="nodes-state muted">No nodes</div>
        )}
      </div>
    </main>
  );
}
