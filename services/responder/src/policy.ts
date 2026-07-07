import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// M7: the risk decision is deterministic code over policy.json — never an LLM.
const POLICY_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'policy.json');

interface Policy {
  require_approval_severities: string[];
  max_auto_blast_radius: number;
  protected_paths: string[];
}

const policy: Policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));

export interface PolicyInput {
  severity: string | null;
  blast_radius: string[];
  fix_path: string;
}

export interface PolicyDecision {
  requires_approval: boolean;
  reasons: string[];
}

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const reasons: string[] = [];
  if (input.severity && policy.require_approval_severities.includes(input.severity)) {
    reasons.push(`severity "${input.severity}" requires approval`);
  }
  if (input.blast_radius.length > policy.max_auto_blast_radius) {
    reasons.push(`blast radius ${input.blast_radius.length} exceeds auto limit ${policy.max_auto_blast_radius}`);
  }
  for (const protectedPath of policy.protected_paths) {
    if (input.fix_path.startsWith(protectedPath)) {
      reasons.push(`fix touches protected path ${protectedPath}`);
    }
  }
  return { requires_approval: reasons.length > 0, reasons };
}
