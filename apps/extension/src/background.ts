import { evaluatePolicy } from "@focusguard/policy-engine";
import { verifyPolicySnapshot } from "@focusguard/security";
import { activate, fetchSnapshot } from "./api.js";
import {
  addOverride,
  getEnrollment,
  getHealth,
  getOverrides,
  getSnapshot,
  setSnapshot,
  updateHealth,
} from "./storage.js";
import type { BlockedTabState } from "./types.js";

const SYNC_ALARM = "focusguard-policy-sync";
const HEALTH_ALARM = "focusguard-health-tick";
const BLOCKED_KEY_PREFIX = "blocked-tab:";

async function synchronize(): Promise<void> {
  const enrollment = await getEnrollment();
  if (!enrollment) return;
  const cached = await getSnapshot();
  try {
    const envelope = await fetchSnapshot();
    await verifyPolicySnapshot(envelope, {
      expectedDeviceId: enrollment.deviceId,
      expectedOrganizationId: enrollment.organizationId,
      minimumVersion: cached?.envelope.payload.snapshotVersion ?? 0,
      now: new Date(),
      publicKeyBase64Url: enrollment.signingPublicKey,
    });
    await setSnapshot({ envelope, verifiedAt: new Date().toISOString() });
    await updateHealth({ lastSyncAt: new Date().toISOString(), lastSyncError: null });
  } catch (error) {
    await updateHealth({
      lastSyncError: error instanceof Error ? error.message.slice(0, 200) : "Policy sync failed",
    });
    throw error;
  }
}

async function observeClock(): Promise<void> {
  const health = await getHealth();
  const now = new Date();
  const last = health.lastObservedWallClock ? Date.parse(health.lastObservedWallClock) : null;
  await updateHealth({
    lastObservedWallClock: now.toISOString(),
    clockRollbackDetected:
      health.clockRollbackDetected || (last !== null && now.getTime() < last - 5 * 60 * 1000),
  });
}

async function evaluateNavigation(url: string) {
  const enrollment = await getEnrollment();
  const snapshot = await getSnapshot();
  if (!enrollment || !snapshot) return null;
  const payload = snapshot.envelope.payload;
  const expired = Date.now() >= Date.parse(payload.validUntil);
  if (expired && payload.failMode === "OPEN") return null;

  const decision = evaluatePolicy({
    user: { id: enrollment.userId, organizationId: enrollment.organizationId },
    device: { id: enrollment.deviceId, organizationId: enrollment.organizationId },
    url,
    timestamp: new Date(),
    policies: payload.policies,
    schedules: payload.schedules,
    commitments: payload.commitments,
    focusSessions: payload.focusSessions,
  });
  if (decision.decision === "ALLOW") return null;
  const overrides = await getOverrides();
  if (
    decision.matchingRule &&
    decision.normalizedDomain &&
    overrides.some(
      (item) =>
        item.ruleId === decision.matchingRule?.id &&
        item.normalizedDomain === decision.normalizedDomain,
    )
  ) {
    return null;
  }
  return { decision, snapshotVersion: payload.snapshotVersion };
}

async function blockNavigation(tabId: number, url: string): Promise<void> {
  if (url.startsWith(chrome.runtime.getURL(""))) return;
  const result = await evaluateNavigation(url);
  if (!result) return;
  const state: BlockedTabState = { originalUrl: url, ...result };
  await chrome.storage.session.set({ [`${BLOCKED_KEY_PREFIX}${tabId}`]: state });
  await chrome.tabs.update(tabId, { url: chrome.runtime.getURL("block.html") });
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0 || details.tabId < 0) return;
  void blockNavigation(details.tabId, details.url);
});

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
  void chrome.alarms.create(HEALTH_ALARM, { periodInMinutes: 1 });
  void synchronize().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  void synchronize().catch(() => undefined);
  void observeClock();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void synchronize().catch(() => undefined);
  if (alarm.name === HEALTH_ALARM) void observeClock();
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  void (async () => {
    const input = message as Record<string, unknown>;
    if (input.type === "status") {
      const [enrollment, snapshot, health, incognitoAllowed] = await Promise.all([
        getEnrollment(),
        getSnapshot(),
        getHealth(),
        chrome.extension.isAllowedIncognitoAccess(),
      ]);
      sendResponse({ enrollment, snapshot, health, incognitoAllowed });
      return;
    }
    if (input.type === "enroll") {
      const enrollment = await activate(String(input.apiBase), String(input.enrollmentCode), String(input.name));
      await synchronize();
      sendResponse({ ok: true, enrollment });
      return;
    }
    if (input.type === "sync") {
      await synchronize();
      sendResponse({ ok: true });
      return;
    }
    if (input.type === "blocked-state") {
      const tabId = sender.tab?.id;
      const values = tabId === undefined ? {} : await chrome.storage.session.get(`${BLOCKED_KEY_PREFIX}${tabId}`);
      sendResponse({ state: tabId === undefined ? null : values[`${BLOCKED_KEY_PREFIX}${tabId}`] ?? null });
      return;
    }
    if (input.type === "override") {
      const tabId = sender.tab?.id;
      if (tabId === undefined) throw new Error("Blocked tab is unavailable.");
      const key = `${BLOCKED_KEY_PREFIX}${tabId}`;
      const value = await chrome.storage.session.get(key);
      const state = value[key] as BlockedTabState | undefined;
      if (!state?.decision.override.available || !state.decision.matchingRule || !state.decision.normalizedDomain) {
        throw new Error("This policy does not permit an override.");
      }
      const overrideLevel = state.decision.override.level;
      if (overrideLevel === null || overrideLevel > 2 || state.decision.override.partnerApprovalRequired) {
        throw new Error("This override must be approved in FocusGuard.");
      }
      const reason = String(input.reason ?? "").trim();
      if (state.decision.override.reasonRequired && reason.length < 3) {
        throw new Error("Add a short reason before using this override.");
      }
      if (input.confirmed !== true) throw new Error("Confirm the override first.");
      const ruleExpiry = state.decision.expiration ? Date.parse(state.decision.expiration) : Number.POSITIVE_INFINITY;
      const expiresAt = new Date(Math.min(Date.now() + 5 * 60 * 1000, ruleExpiry)).toISOString();
      await addOverride({
        ruleId: state.decision.matchingRule.id,
        normalizedDomain: state.decision.normalizedDomain,
        expiresAt,
      });
      await chrome.storage.session.remove(key);
      await chrome.tabs.update(tabId, { url: state.originalUrl });
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ error: "Unknown message" });
  })().catch((error: unknown) => {
    sendResponse({ error: error instanceof Error ? error.message : "Operation failed" });
  });
  return true;
});
