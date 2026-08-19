import type { Policy, Schedule } from "@focusguard/schemas";
import { evaluatePolicy, normalizeNavigableUrl } from "@focusguard/policy-engine";
import { describe, expect, it } from "vitest";

const organizationId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";
const policyId = "44444444-4444-4444-8444-444444444444";
const scheduleId = "55555555-5555-4555-8555-555555555555";

const always: Schedule = {
  id: scheduleId,
  organizationId,
  userId,
  name: "Always",
  timeZone: "UTC",
  windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "00:00" }],
  validFrom: null,
  validUntil: null,
};

const policy: Policy = {
  id: policyId,
  organizationId,
  userId,
  name: "Bypass target",
  enabled: true,
  priority: 0,
  validFrom: null,
  validUntil: null,
  rules: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      policyId,
      priority: 0,
      enabled: true,
      decision: "BLOCK",
      conditions: {
        domains: ["reddit.com", "192.0.2.4", "[2001:db8::4]"],
        categories: [],
        applications: [],
        deviceIds: [],
        scheduleIds: [scheduleId],
        focusSessionRequired: false,
      },
      reason: "Defensive bypass fixture.",
      expiresAt: null,
      override: {
        available: false,
        level: 5,
        cooldownSeconds: 0,
        reasonRequired: false,
        partnerApprovalRequired: false,
      },
    },
  ],
};

function decision(url: string): string {
  return evaluatePolicy({
    user: { id: userId, organizationId },
    device: { id: deviceId, organizationId },
    url,
    timestamp: "2026-08-18T12:00:00Z",
    policies: [policy],
    schedules: [always],
  }).decision;
}

describe("browser-level bypass lab", () => {
  it.each([
    ["direct navigation", "https://reddit.com", "BLOCK"],
    ["subdomain", "https://old.reddit.com/r/all", "BLOCK"],
    ["alternate port", "https://reddit.com:8443/path", "BLOCK"],
    ["userinfo confusion", "https://allowed.example@reddit.com/path", "BLOCK"],
    ["uppercase and trailing dot", "https://WWW.REDDIT.COM./", "BLOCK"],
    ["IPv4 direct", "http://192.0.2.4/path", "BLOCK"],
    ["IPv6 direct", "http://[2001:db8::4]:8080/path", "BLOCK"],
    ["lookalike prefix", "https://notreddit.com", "ALLOW"],
    ["lookalike suffix", "https://reddit.com.evil.example", "ALLOW"],
  ])("handles %s", (_name, url, expected) => expect(decision(url)).toBe(expected));

  it("normalizes an encoded dot in the host and still blocks the target", () => {
    expect(normalizeNavigableUrl("https://reddit%2ecom/path")).toBe("reddit.com");
    expect(decision("https://reddit%2ecom/path")).toBe("BLOCK");
  });

  it("evaluates a redirect destination when the browser emits its navigation", () => {
    expect(decision("https://short.example/x")).toBe("ALLOW");
    expect(decision("https://reddit.com/r/final-destination")).toBe("BLOCK");
  });

  it("makes no unenforceable claim for an unknown URL shortener destination", () => {
    expect(decision("https://short.example/opaque-token")).toBe("ALLOW");
  });
});
