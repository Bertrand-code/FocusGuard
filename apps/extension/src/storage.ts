import type { EnrollmentState, HealthState, LocalOverride, VerifiedSnapshotState } from "./types.js";

const DEFAULT_HEALTH: HealthState = {
  lastSyncAt: null,
  lastSyncError: null,
  clockRollbackDetected: false,
  lastObservedWallClock: null,
};

export async function getEnrollment(): Promise<EnrollmentState | null> {
  const result = await chrome.storage.local.get("enrollment");
  return (result.enrollment as EnrollmentState | undefined) ?? null;
}

export async function setEnrollment(value: EnrollmentState): Promise<void> {
  await chrome.storage.local.set({ enrollment: value });
}

export async function getSnapshot(): Promise<VerifiedSnapshotState | null> {
  const result = await chrome.storage.local.get("verifiedSnapshot");
  return (result.verifiedSnapshot as VerifiedSnapshotState | undefined) ?? null;
}

export async function setSnapshot(value: VerifiedSnapshotState): Promise<void> {
  await chrome.storage.local.set({ verifiedSnapshot: value });
}

export async function getHealth(): Promise<HealthState> {
  const result = await chrome.storage.local.get("health");
  return { ...DEFAULT_HEALTH, ...(result.health as Partial<HealthState> | undefined) };
}

export async function updateHealth(value: Partial<HealthState>): Promise<void> {
  await chrome.storage.local.set({ health: { ...(await getHealth()), ...value } });
}

export async function getOverrides(): Promise<LocalOverride[]> {
  const result = await chrome.storage.local.get("localOverrides");
  const values = (result.localOverrides as LocalOverride[] | undefined) ?? [];
  const now = Date.now();
  return values.filter((item) => Date.parse(item.expiresAt) > now);
}

export async function addOverride(value: LocalOverride): Promise<void> {
  const current = await getOverrides();
  await chrome.storage.local.set({
    localOverrides: current.filter(
      (item) => !(item.ruleId === value.ruleId && item.normalizedDomain === value.normalizedDomain),
    ).concat(value),
  });
}
