import type { PolicyDecision } from "@focusguard/policy-engine";
import type { SignedPolicySnapshot } from "@focusguard/schemas";

export interface EnrollmentState {
  apiBase: string;
  deviceId: string;
  organizationId: string;
  userId: string;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  signingKeyId: string;
  signingPublicKey: string;
}

export interface VerifiedSnapshotState {
  envelope: SignedPolicySnapshot;
  verifiedAt: string;
}

export interface HealthState {
  lastSyncAt: string | null;
  lastSyncError: string | null;
  clockRollbackDetected: boolean;
  lastObservedWallClock: string | null;
}

export interface BlockedTabState {
  originalUrl: string;
  decision: PolicyDecision;
  snapshotVersion: number;
}

export interface LocalOverride {
  ruleId: string;
  normalizedDomain: string;
  expiresAt: string;
}
