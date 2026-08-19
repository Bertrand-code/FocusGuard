import type { Policy, PolicyRule, Schedule } from "@focusguard/schemas";
import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./engine.js";
import { domainMatches, normalizeDomain, normalizeNavigableUrl } from "./normalize.js";
import { isScheduleActive } from "./schedule.js";

const IDS = {
  organization: "11111111-1111-4111-8111-111111111111",
  user: "22222222-2222-4222-8222-222222222222",
  device: "33333333-3333-4333-8333-333333333333",
  policy: "44444444-4444-4444-8444-444444444444",
  rule: "55555555-5555-4555-8555-555555555555",
  schedule: "66666666-6666-4666-8666-666666666666",
  commitment: "77777777-7777-4777-8777-777777777777",
};

const schedule: Schedule = {
  id: IDS.schedule,
  organizationId: IDS.organization,
  userId: IDS.user,
  name: "Work hours",
  timeZone: "America/Los_Angeles",
  windows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }],
  validFrom: null,
  validUntil: null,
};

function makeRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: IDS.rule,
    policyId: IDS.policy,
    priority: 0,
    enabled: true,
    decision: "BLOCK",
    conditions: {
      domains: ["reddit.com"],
      categories: [],
      applications: [],
      deviceIds: [],
      scheduleIds: [IDS.schedule],
      focusSessionRequired: false,
    },
    reason: "Reddit is blocked during work hours.",
    expiresAt: null,
    override: {
      available: true,
      level: 2,
      cooldownSeconds: 0,
      reasonRequired: true,
      partnerApprovalRequired: false,
    },
    ...overrides,
  };
}

function makePolicy(rule = makeRule(), overrides: Partial<Policy> = {}): Policy {
  return {
    id: IDS.policy,
    organizationId: IDS.organization,
    userId: IDS.user,
    name: "Work distractions",
    enabled: true,
    priority: 0,
    validFrom: null,
    validUntil: null,
    rules: [rule],
    ...overrides,
  };
}

function evaluate(overrides: Partial<Parameters<typeof evaluatePolicy>[0]> = {}) {
  return evaluatePolicy({
    user: { id: IDS.user, organizationId: IDS.organization },
    device: { id: IDS.device, organizationId: IDS.organization },
    url: "https://www.reddit.com/r/typescript?secret=value",
    timestamp: "2026-08-18T19:00:00Z",
    policies: [makePolicy()],
    schedules: [schedule],
    ...overrides,
  });
}

describe("URL and domain normalization", () => {
  it.each([
    ["https://reddit.com/path", "reddit.com"],
    ["https://user:pass@WWW.Reddit.com:443/path", "www.reddit.com"],
    ["http://reddit.com./", "reddit.com"],
    ["https://xn--bcher-kva.example/", "xn--bcher-kva.example"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeNavigableUrl(input)).toBe(expected);
  });

  it.each(["javascript:alert(1)", "file:///etc/passwd", "not a url", "https:///"])(
    "rejects unsupported navigation %s",
    (input) => expect(normalizeNavigableUrl(input)).toBeNull(),
  );

  it("rejects ports and credentials in configured domains", () => {
    expect(normalizeDomain("reddit.com:8080")).toBeNull();
    expect(normalizeDomain("user@reddit.com")).toBeNull();
  });

  it("matches only DNS label boundaries", () => {
    expect(domainMatches("www.reddit.com", "reddit.com")).toBe(true);
    expect(domainMatches("reddit.com.evil.example", "reddit.com")).toBe(false);
    expect(domainMatches("notreddit.com", "reddit.com")).toBe(false);
  });

  it("requires a subdomain for explicit wildcards", () => {
    expect(domainMatches("reddit.com", "*.reddit.com")).toBe(false);
    expect(domainMatches("old.reddit.com", "*.reddit.com")).toBe(true);
  });
});

describe("schedules", () => {
  it("evaluates an IANA-zone weekday window", () => {
    expect(isScheduleActive(schedule, new Date("2026-08-18T19:00:00Z"))).toBe(true);
    expect(isScheduleActive(schedule, new Date("2026-08-18T02:00:00Z"))).toBe(false);
  });

  it("supports overnight windows using the start day", () => {
    const overnight = { ...schedule, windows: [{ days: [1], start: "22:00", end: "02:00" }] };
    expect(isScheduleActive(overnight, new Date("2026-08-18T08:00:00Z"))).toBe(true);
    expect(isScheduleActive(overnight, new Date("2026-08-18T10:30:00Z"))).toBe(false);
  });

  it("honors schedule validity", () => {
    expect(
      isScheduleActive({ ...schedule, validUntil: "2026-08-18T18:00:00Z" }, new Date("2026-08-18T19:00:00Z")),
    ).toBe(false);
  });
});

describe("policy evaluation", () => {
  it("blocks a configured domain during work hours without exposing the path", () => {
    const result = evaluate();
    expect(result.decision).toBe("BLOCK");
    expect(result.normalizedDomain).toBe("www.reddit.com");
    expect(JSON.stringify(result)).not.toContain("/r/typescript");
    expect(JSON.stringify(result)).not.toContain("secret=value");
  });

  it("allows the configured domain outside its schedule", () => {
    expect(evaluate({ timestamp: "2026-08-18T02:00:00Z" }).decision).toBe("ALLOW");
  });

  it("allows unrelated navigation", () => {
    expect(evaluate({ url: "https://example.com" }).reasonCode).toBe("NO_MATCH");
  });

  it("does not evaluate cross-tenant policy data", () => {
    const foreign = makePolicy(makeRule(), {
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(evaluate({ policies: [foreign] }).decision).toBe("ALLOW");
  });

  it("rejects a cross-tenant user/device subject", () => {
    expect(
      evaluate({
        device: { id: IDS.device, organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      }).reasonCode,
    ).toBe("SUBJECT_MISMATCH");
  });

  it("lets a higher-priority allow exception win", () => {
    const allow = makeRule({
      id: "88888888-8888-4888-8888-888888888888",
      priority: 10,
      decision: "ALLOW",
      conditions: { ...makeRule().conditions, domains: ["old.reddit.com"] },
      reason: "Explicit exception.",
    });
    expect(
      evaluate({
        url: "https://old.reddit.com",
        policies: [{ ...makePolicy(), rules: [makeRule(), allow] }],
      }).decision,
    ).toBe("ALLOW");
  });

  it("uses stable restrictive ordering when priority and specificity tie", () => {
    const warn = makeRule({
      id: "88888888-8888-4888-8888-888888888888",
      decision: "WARN",
    });
    expect(evaluate({ policies: [{ ...makePolicy(), rules: [warn, makeRule()] }] }).decision).toBe("BLOCK");
  });

  it("applies a commitment floor and disables level-five override", () => {
    const rule = makeRule({ decision: "WARN" });
    const result = evaluate({
      policies: [makePolicy(rule)],
      commitments: [
        {
          id: IDS.commitment,
          organizationId: IDS.organization,
          userId: IDS.user,
          policyId: IDS.policy,
          level: 5,
          startsAt: "2026-08-18T18:00:00Z",
          endsAt: "2026-08-18T20:00:00Z",
          minimumDecision: "BLOCK",
          state: "ACTIVE",
        },
      ],
    });
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe("COMMITMENT_FLOOR");
    expect(result.override.available).toBe(false);
    expect(result.expiration).toBe("2026-08-18T20:00:00Z");
  });

  it("honors focus-session-only conditions", () => {
    const rule = makeRule({
      conditions: { ...makeRule().conditions, scheduleIds: [], focusSessionRequired: true },
    });
    expect(evaluate({ policies: [makePolicy(rule)], schedules: [] }).decision).toBe("ALLOW");
    expect(
      evaluate({
        policies: [makePolicy(rule)],
        schedules: [],
        focusSessions: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            policyId: IDS.policy,
            startsAt: "2026-08-18T18:00:00Z",
            endsAt: "2026-08-18T20:00:00Z",
            state: "ACTIVE",
          },
        ],
      }).decision,
    ).toBe("BLOCK");
  });

  it("matches a content category without receiving a URL", () => {
    const rule = makeRule({
      conditions: { ...makeRule().conditions, domains: [], categories: ["social-media"], scheduleIds: [] },
    });
    expect(
      evaluatePolicy({
        user: { id: IDS.user, organizationId: IDS.organization },
        device: { id: IDS.device, organizationId: IDS.organization },
        contentCategory: "social-media",
        timestamp: "2026-08-18T19:00:00Z",
        policies: [makePolicy(rule)],
        schedules: [],
      }).decision,
    ).toBe("BLOCK");
  });

  it("returns a complete decision when target input is invalid", () => {
    const result = evaluate({ url: "data:text/plain,hello" });
    expect(result).toMatchObject({
      decision: "ALLOW",
      matchingPolicy: null,
      matchingRule: null,
      expiration: null,
      normalizedDomain: null,
    });
  });
});
