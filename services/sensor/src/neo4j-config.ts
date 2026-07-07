import neo4j, { type Driver, type Session } from 'neo4j-driver';

export const NEO4J_URL =
  process.env.NEO4J_URL ?? process.env.NEO4J_URI ?? 'bolt://localhost:7687';
export const NEO4J_USER =
  process.env.NEO4J_USER ?? process.env.NEO4J_USERNAME ?? 'neo4j';
export const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'devpassword';
export const NEO4J_DATABASE = process.env.NEO4J_DATABASE;

export function createDriver(): Driver {
  return neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
}

export function openSession(driver: Driver): Session {
  return NEO4J_DATABASE
    ? driver.session({ database: NEO4J_DATABASE })
    : driver.session();
}
