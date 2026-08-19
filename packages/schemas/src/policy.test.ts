import { describe, expect, it } from "vitest";
import { PolicySnapshotPayloadSchema, RuleConditionsSchema } from "./policy.js";

describe("policy schemas", () => {
  it("rejects a rule with no target", () => {
    expect(() =>
      RuleConditionsSchema.parse({
        domains: [],
        categories: [],
        applications: [],
      }),
    ).toThrow(/must target/);
  });

  it("rejects invalid snapshot time ordering", () => {
    expect(() =>
      PolicySnapshotPayloadSchema.parse({
        schemaVersion: 1,
        snapshotVersion: 1,
        organizationId: "11111111-1111-4111-8111-111111111111",
        userId: "22222222-2222-4222-8222-222222222222",
        deviceId: "33333333-3333-4333-8333-333333333333",
        issuedAt: "2026-08-18T12:00:00Z",
        refreshAfter: "2026-08-18T11:00:00Z",
        validUntil: "2026-08-19T12:00:00Z",
        failMode: "OPEN",
        policies: [],
        schedules: [],
      }),
    ).toThrow(/snapshot times/);
  });
});
