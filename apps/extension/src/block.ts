import type { BlockedTabState } from "./types.js";

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
};

let state: BlockedTabState | null = null;

function showError(message: string): void {
  const error = byId<HTMLParagraphElement>("error");
  error.hidden = false;
  error.textContent = message;
}

async function initialize(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: "blocked-state" })) as {
    state: BlockedTabState | null;
    error?: string;
  };
  if (response.error) throw new Error(response.error);
  state = response.state;
  if (!state) throw new Error("The block decision is no longer available. Go back and try again.");
  const { decision } = state;
  byId<HTMLElement>("decision-title").textContent =
    decision.decision === "WARN" ? "Pause before continuing" : "This site is blocked";
  byId<HTMLElement>("reason").textContent = decision.reason;
  byId<HTMLElement>("domain").textContent = decision.normalizedDomain ?? "Configured target";
  byId<HTMLElement>("policy").textContent = decision.matchingPolicy?.name ?? "Active policy";
  byId<HTMLElement>("expiration").textContent = decision.expiration
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(decision.expiration),
      )
    : "Policy changes";
  const permitted =
    decision.override.available &&
    decision.override.level !== null &&
    decision.override.level <= 2 &&
    !decision.override.partnerApprovalRequired;
  byId<HTMLElement>("override-form").hidden = !permitted;
  byId<HTMLElement>("override-unavailable").hidden = permitted;
  byId<HTMLElement>("reason-label").hidden = !decision.override.reasonRequired;
}

byId<HTMLButtonElement>("back").addEventListener("click", () => history.back());
byId<HTMLFormElement>("override-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void chrome.runtime
    .sendMessage({
      type: "override",
      reason: byId<HTMLTextAreaElement>("override-reason").value,
      confirmed: byId<HTMLInputElement>("override-confirm").checked,
    })
    .then((response: { error?: string }) => {
      if (response.error) throw new Error(response.error);
    })
    .catch((error: unknown) => showError(error instanceof Error ? error.message : "Override failed"));
});

void initialize().catch((error: unknown) => showError(error instanceof Error ? error.message : "Block details unavailable"));
