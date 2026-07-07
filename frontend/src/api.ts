import { createClient, type ButterbaseClient } from '@butterbase/sdk';

export const APP_ID = import.meta.env.VITE_BUTTERBASE_APP_ID ?? 'app_gsuwgmmbc74g';
export const BB_API_URL = import.meta.env.VITE_BUTTERBASE_API_URL ?? 'https://api.butterbase.ai';
const SENSOR = import.meta.env.VITE_SENSOR_URL ?? '/sensor';
const RESPONDER = import.meta.env.VITE_RESPONDER_URL ?? '/responder';

export const butterbase: ButterbaseClient = createClient({ appId: APP_ID, apiUrl: BB_API_URL });

export interface Incident {
  status: 'ok' | 'incident';
  failing_tests: string[];
  changed_functions: string[];
  root_cause: string | null;
  blast_radius: string[];
}

export interface Diagnosis {
  severity: 'low' | 'medium' | 'high';
  root_cause_explanation: string;
  proposed_fix_approach: string;
  cited_runbook: string | null;
  candidate_fix?: { path: string; content: string };
}

export async function fetchIncident(): Promise<Incident> {
  const res = await fetch(`${SENSOR}/incident`);
  if (!res.ok) throw new Error(`sensor ${res.status}`);
  return res.json();
}

async function responderPost(path: string, token: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${RESPONDER}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json() };
}

export const diagnose = (token: string) => responderPost('/diagnose', token);
export const remediate = (token: string) => responderPost('/remediate', token);
export const apply = (token: string) => responderPost('/apply', token);
export const decideApproval = (token: string, id: string, decision: 'approved' | 'denied') =>
  responderPost(`/approvals/${id}`, token, { decision });
