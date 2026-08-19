import { z } from "zod";

export const DecisionSchema = z.enum([
  "ALLOW",
  "WARN",
  "LIMIT",
  "BLOCK",
  "ESCALATE",
]);
export type Decision = z.infer<typeof DecisionSchema>;

export const UuidSchema = z.string().uuid();
const IsoTimestampSchema = z.string().datetime({ offset: true });
const LocalTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const DomainSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9.*:[\]-]+$/i, "domain must be normalized ASCII");

export const WeeklyWindowSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1),
  start: LocalTimeSchema,
  end: LocalTimeSchema,
});
export type WeeklyWindow = z.infer<typeof WeeklyWindowSchema>;

export const ScheduleSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  userId: UuidSchema,
  name: z.string().min(1).max(120),
  timeZone: z.string().min(1).max(80),
  windows: z.array(WeeklyWindowSchema).min(1).max(64),
  validFrom: IsoTimestampSchema.nullable().default(null),
  validUntil: IsoTimestampSchema.nullable().default(null),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const OverrideSchema = z.object({
  available: z.boolean(),
  level: z.number().int().min(1).max(5),
  cooldownSeconds: z.number().int().min(0).max(604800).default(0),
  reasonRequired: z.boolean().default(false),
  partnerApprovalRequired: z.boolean().default(false),
});
export type Override = z.infer<typeof OverrideSchema>;

export const RuleConditionsSchema = z
  .object({
    domains: z.array(DomainSchema).max(2000).default([]),
    categories: z.array(z.string().min(1).max(80)).max(100).default([]),
    applications: z.array(z.string().min(1).max(120)).max(100).default([]),
    deviceIds: z.array(UuidSchema).max(100).default([]),
    scheduleIds: z.array(UuidSchema).max(50).default([]),
    focusSessionRequired: z.boolean().default(false),
  })
  .refine(
    (value) =>
      value.domains.length > 0 ||
      value.categories.length > 0 ||
      value.applications.length > 0,
    "a rule must target a domain, category, or application",
  );
export type RuleConditions = z.infer<typeof RuleConditionsSchema>;

export const PolicyRuleSchema = z.object({
  id: UuidSchema,
  policyId: UuidSchema,
  priority: z.number().int().min(-100000).max(100000).default(0),
  enabled: z.boolean().default(true),
  decision: DecisionSchema,
  conditions: RuleConditionsSchema,
  reason: z.string().min(1).max(240),
  expiresAt: IsoTimestampSchema.nullable().default(null),
  override: OverrideSchema,
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicySchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  userId: UuidSchema,
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(-100000).max(100000).default(0),
  validFrom: IsoTimestampSchema.nullable().default(null),
  validUntil: IsoTimestampSchema.nullable().default(null),
  rules: z.array(PolicyRuleSchema).max(5000),
});
export type Policy = z.infer<typeof PolicySchema>;

export const CommitmentSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  userId: UuidSchema,
  policyId: UuidSchema,
  level: z.number().int().min(1).max(5),
  startsAt: IsoTimestampSchema,
  endsAt: IsoTimestampSchema,
  minimumDecision: DecisionSchema,
  state: z.enum(["PENDING", "ACTIVE", "EXPIRED", "RECOVERING", "REVOKED"]),
});
export type Commitment = z.infer<typeof CommitmentSchema>;

export const FocusSessionSchema = z.object({
  id: UuidSchema,
  policyId: UuidSchema.nullable(),
  startsAt: IsoTimestampSchema,
  endsAt: IsoTimestampSchema,
  state: z.enum(["SCHEDULED", "ACTIVE", "COMPLETED", "CANCELLED"]),
});
export type FocusSession = z.infer<typeof FocusSessionSchema>;

export const PolicySnapshotPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    snapshotVersion: z.number().int().positive(),
    organizationId: UuidSchema,
    userId: UuidSchema,
    deviceId: UuidSchema,
    issuedAt: IsoTimestampSchema,
    refreshAfter: IsoTimestampSchema,
    validUntil: IsoTimestampSchema,
    failMode: z.enum(["OPEN", "CLOSED_FOR_CONFIGURED_TARGETS"]),
    policies: z.array(PolicySchema),
    schedules: z.array(ScheduleSchema),
    commitments: z.array(CommitmentSchema).default([]),
    focusSessions: z.array(FocusSessionSchema).default([]),
  })
  .superRefine((value, context) => {
    const issuedAt = Date.parse(value.issuedAt);
    const refreshAfter = Date.parse(value.refreshAfter);
    const validUntil = Date.parse(value.validUntil);
    if (!(issuedAt < refreshAfter && refreshAfter < validUntil)) {
      context.addIssue({
        code: "custom",
        message: "snapshot times must satisfy issuedAt < refreshAfter < validUntil",
        path: ["validUntil"],
      });
    }
  });
export type PolicySnapshotPayload = z.infer<typeof PolicySnapshotPayloadSchema>;

export const SignedPolicySnapshotSchema = z.object({
  algorithm: z.literal("Ed25519"),
  keyId: z.string().min(1).max(80),
  payload: PolicySnapshotPayloadSchema,
  signature: z.string().min(40).max(200),
});
export type SignedPolicySnapshot = z.infer<typeof SignedPolicySnapshotSchema>;

export const PolicyProposalSchema = z.object({
  proposalId: UuidSchema,
  sourceText: z.string().min(1).max(1000),
  policy: PolicySchema,
  schedules: z.array(ScheduleSchema),
  warnings: z.array(z.string().max(300)).max(20),
  requiresConfirmation: z.literal(true),
  expiresAt: IsoTimestampSchema,
});
export type PolicyProposal = z.infer<typeof PolicyProposalSchema>;
