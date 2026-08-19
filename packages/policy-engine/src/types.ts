import type {
  Commitment,
  Decision,
  FocusSession,
  Policy,
  PolicyRule,
  Schedule,
} from "@focusguard/schemas";

export interface PolicyEngineInput {
  user: { id: string; organizationId: string };
  device: { id: string; organizationId: string; capabilities?: readonly string[] };
  url?: string;
  domain?: string;
  contentCategory?: string;
  application?: string;
  timestamp: string | Date;
  policies: readonly Policy[];
  schedules: readonly Schedule[];
  commitments?: readonly Commitment[];
  focusSessions?: readonly FocusSession[];
}

export interface PolicyDecision {
  decision: Decision;
  matchingPolicy: Pick<Policy, "id" | "name"> | null;
  matchingRule: Pick<PolicyRule, "id" | "reason"> | null;
  reason: string;
  reasonCode:
    | "NO_MATCH"
    | "INVALID_TARGET"
    | "RULE_MATCH"
    | "COMMITMENT_FLOOR"
    | "SUBJECT_MISMATCH";
  expiration: string | null;
  override: {
    available: boolean;
    level: number | null;
    cooldownSeconds: number;
    reasonRequired: boolean;
    partnerApprovalRequired: boolean;
  };
  normalizedDomain: string | null;
}
