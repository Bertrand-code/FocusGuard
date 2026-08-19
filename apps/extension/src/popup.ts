import type { HealthState, EnrollmentState, VerifiedSnapshotState } from "./types.js";

type StatusResponse = {
  enrollment: EnrollmentState | null;
  snapshot: VerifiedSnapshotState | null;
  health: HealthState;
  incognitoAllowed: boolean;
  error?: string;
};

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
};

function date(value: string | null | undefined): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";
}

function showError(message: string | null): void {
  const error = byId<HTMLParagraphElement>("error");
  error.hidden = !message;
  error.textContent = message;
}

async function render(): Promise<void> {
  const status = (await chrome.runtime.sendMessage({ type: "status" })) as StatusResponse;
  if (status.error) throw new Error(status.error);
  const enrolled = status.enrollment !== null;
  byId<HTMLElement>("enroll-form").hidden = enrolled;
  byId<HTMLElement>("health-panel").hidden = !enrolled;
  const label = byId<HTMLParagraphElement>("status");
  const dot = byId<HTMLSpanElement>("status-dot");
  dot.className = "status-dot";
  if (!enrolled) {
    label.textContent = "Not enrolled";
    return;
  }
  const expired = !status.snapshot || Date.now() >= Date.parse(status.snapshot.envelope.payload.validUntil);
  const degraded = expired || status.health.clockRollbackDetected || status.health.lastSyncError !== null;
  dot.classList.add(degraded ? "degraded" : "healthy");
  label.textContent = degraded ? "Active with a health warning" : "Installed and active";
  byId<HTMLElement>("policy-version").textContent = status.snapshot
    ? `Version ${status.snapshot.envelope.payload.snapshotVersion}`
    : "No verified policy";
  byId<HTMLElement>("valid-until").textContent = date(status.snapshot?.envelope.payload.validUntil);
  byId<HTMLElement>("last-sync").textContent = status.health.lastSyncError ?? date(status.health.lastSyncAt);
  byId<HTMLElement>("incognito").textContent = status.incognitoAllowed ? "Enabled" : "Not enabled";
}

byId<HTMLFormElement>("enroll-form").addEventListener("submit", (event) => {
  event.preventDefault();
  showError(null);
  void chrome.runtime
    .sendMessage({
      type: "enroll",
      apiBase: byId<HTMLInputElement>("api-base").value,
      enrollmentCode: byId<HTMLInputElement>("enrollment-code").value,
      name: byId<HTMLInputElement>("device-name").value,
    })
    .then((response: { error?: string }) => {
      if (response.error) throw new Error(response.error);
      return render();
    })
    .catch((error: unknown) => showError(error instanceof Error ? error.message : "Enrollment failed"));
});

byId<HTMLButtonElement>("sync").addEventListener("click", () => {
  showError(null);
  void chrome.runtime
    .sendMessage({ type: "sync" })
    .then((response: { error?: string }) => {
      if (response.error) throw new Error(response.error);
      return render();
    })
    .catch((error: unknown) => showError(error instanceof Error ? error.message : "Sync failed"));
});

void render().catch((error: unknown) => showError(error instanceof Error ? error.message : "Status unavailable"));
