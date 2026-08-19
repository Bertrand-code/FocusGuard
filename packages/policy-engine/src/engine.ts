import type { Commitment, Decision, Policy, PolicyRule, Schedule } from "@focusguard/schemas";
import { domainMatches, normalizeDomain, normalizeNavigableUrl } from "./normalize.js";
import { isScheduleActive } from "./schedule.js";
import type { PolicyDecision, PolicyEngineInput } from "./types.js";

const DECISION_RANK: Record<Decision, number> = {
  ALLOW: 0,
  WARN: 1,
  LIMIT: 2,
  BLOCK: 3,
  ESCALATE: 4,
};

interface Candidate {
  policy: Policy;
  rule: PolicyRule;
  specificity: number;
}

const NO_OVERRIDE: PolicyDecision["override"] = {
  available: false,
  level: null,
  cooldownSeconds: 0,
  reasonRequired: false,
  partnerApprovalRequired: false,
};

function isTimeActive(from: string | null, until: string | null, timestamp: number): boolean {
  return (!from || timestamp >= Date.parse(from)) && (!until || timestamp < Date.parse(until));
}

function activeSchedulesById(schedules: readonly Schedule[], timestamp: Date): Set<string> {
  return new Set(schedules.filter((item) => isScheduleActive(item, timestamp)).map((item) => item.id));
}

function matchingSpecificity(
  rule: PolicyRule,
  input: PolicyEngineInput,
  hostname: string | null,
  activeSchedules: ReadonlySet<string>,
  hasFocusSession: boolean,
): number | null {
  const { conditions } = rule;
  if (conditions.deviceIds.length > 0 && !conditions.deviceIds.includes(input.device.id)) return null;
  if (conditions.scheduleIds.length > 0 && !conditions.scheduleIds.some((id) => activeSchedules.has(id))) return null;
  if (conditions.focusSessionRequired && !hasFocusSession) return null;

  let specificity = 0;
  let targetMatched = false;
  if (hostname && conditions.domains.some((domain) => domainMatches(hostname, domain))) {
    targetMatched = true;
    specificity += 300 + Math.max(...conditions.domains.map((domain) => domain.replace(/^\*\./, "").split(".").length));
  }
  if (input.contentCategory && conditions.categories.includes(input.contentCategory)) {
    targetMatched = true;
    specificity += 200;
  }
  if (input.application && conditions.applications.includes(input.application)) {
    targetMatched = true;
    specificity += 250;
  }
  if (!targetMatched) return null;
  if (conditions.deviceIds.length > 0) specificity += 40;
  if (conditions.scheduleIds.length > 0) specificity += 20;
  if (conditions.focusSessionRequired) specificity += 10;
  return specificity;
}

function activeCommitment(
  commitments: readonly Commitment[],
  policyId: string,
  timestamp: number,
): Commitment | null {
  const matches = commitments
    .filter(
      (item) =>
        item.policyId === policyId &&
        item.state === "ACTIVE" &&
        timestamp >= Date.parse(item.startsAt) &&
        timestamp < Date.parse(item.endsAt),
    )
    .sort((left, right) => DECISION_RANK[right.minimumDecision] - DECISION_RANK[left.minimumDecision]);
  return matches[0] ?? null;
}

function expirationOf(policy: Policy, rule: PolicyRule, commitment: Commitment | null): string | null {
  const values = [policy.validUntil, rule.expiresAt, commitment?.endsAt ?? null]
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return values[0] ?? null;
}

export function evaluatePolicy(input: PolicyEngineInput): PolicyDecision {
  const timestamp = input.timestamp instanceof Date ? input.timestamp : new Date(input.timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    return {
      decision: "ALLOW",
      matchingPolicy: null,
      matchingRule: null,
      reason: "The evaluation timestamp is invalid.",
      reasonCode: "INVALID_TARGET",
      expiration: null,
      override: NO_OVERRIDE,
      normalizedDomain: null,
    };
  }

  if (input.user.organizationId !== input.device.organizationId) {
    return {
      decision: "ALLOW",
      matchingPolicy: null,
      matchingRule: null,
      reason: "User and device subjects do not share an organization.",
      reasonCode: "SUBJECT_MISMATCH",
      expiration: null,
      override: NO_OVERRIDE,
      normalizedDomain: null,
    };
  }

  const normalizedDomain = input.url
    ? normalizeNavigableUrl(input.url)
    : input.domain
      ? normalizeDomain(input.domain)
      : null;
  if ((input.url || input.domain) && !normalizedDomain) {
    return {
      decision: "ALLOW",
      matchingPolicy: null,
      matchingRule: null,
      reason: "The navigation target is not a supported HTTP(S) domain.",
      reasonCode: "INVALID_TARGET",
      expiration: null,
      override: NO_OVERRIDE,
      normalizedDomain: null,
    };
  }

  const now = timestamp.getTime();
  const activeSchedules = activeSchedulesById(input.schedules, timestamp);
  const focusSessions = input.focusSessions ?? [];
  const hasFocusSession = focusSessions.some(
    (session) =>
      session.state === "ACTIVE" &&
      now >= Date.parse(session.startsAt) &&
      now < Date.parse(session.endsAt),
  );
  const candidates: Candidate[] = [];

  for (const policy of input.policies) {
    if (
      !policy.enabled ||
      policy.organizationId !== input.user.organizationId ||
      policy.userId !== input.user.id ||
      !isTimeActive(policy.validFrom, policy.validUntil, now)
    ) {
      continue;
    }
    for (const rule of policy.rules) {
      if (!rule.enabled || rule.policyId !== policy.id || (rule.expiresAt && now >= Date.parse(rule.expiresAt))) continue;
      const specificity = matchingSpecificity(
        rule,
        input,
        normalizedDomain,
        activeSchedules,
        hasFocusSession,
      );
      if (specificity !== null) candidates.push({ policy, rule, specificity });
    }
  }

  candidates.sort(
    (left, right) =>
      right.policy.priority - left.policy.priority ||
      right.rule.priority - left.rule.priority ||
      right.specificity - left.specificity ||
      DECISION_RANK[right.rule.decision] - DECISION_RANK[left.rule.decision] ||
      left.policy.id.localeCompare(right.policy.id) ||
      left.rule.id.localeCompare(right.rule.id),
  );

  const match = candidates[0];
  if (!match) {
    return {
      decision: "ALLOW",
      matchingPolicy: null,
      matchingRule: null,
      reason: "No active policy rule matched.",
      reasonCode: "NO_MATCH",
      expiration: null,
      override: NO_OVERRIDE,
      normalizedDomain,
    };
  }

  const commitment = activeCommitment(input.commitments ?? [], match.policy.id, now);
  const floorApplied = commitment && DECISION_RANK[commitment.minimumDecision] > DECISION_RANK[match.rule.decision];
  const decision = floorApplied ? commitment.minimumDecision : match.rule.decision;
  const override = match.rule.override;
  const commitmentLocksOverride = commitment !== null && commitment.level >= 5;

  return {
    decision,
    matchingPolicy: { id: match.policy.id, name: match.policy.name },
    matchingRule: { id: match.rule.id, reason: match.rule.reason },
    reason: floorApplied
      ? `${match.rule.reason} An active commitment raises the minimum enforcement level.`
      : match.rule.reason,
    reasonCode: floorApplied ? "COMMITMENT_FLOOR" : "RULE_MATCH",
    expiration: expirationOf(match.policy, match.rule, commitment),
    override: {
      available: override.available && !commitmentLocksOverride,
      level: commitment ? Math.max(override.level, commitment.level) : override.level,
      cooldownSeconds: override.cooldownSeconds,
      reasonRequired: override.reasonRequired,
      partnerApprovalRequired: override.partnerApprovalRequired || (commitment?.level === 4),
    },
    normalizedDomain,
  };
}
