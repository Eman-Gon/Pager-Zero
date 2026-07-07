export interface Patient {
  age: number;
  hasActiveCoverage: boolean;
}

export interface Claim {
  amount: number;
  priority: "routine" | "urgent";
  codes: string[];
}

export interface Decision {
  approved: boolean;
  copay: number;
  riskScore: number;
  reason: string;
}
