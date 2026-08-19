import type { SignedPolicySnapshot } from "@focusguard/schemas";
import { getEnrollment, setEnrollment } from "./storage.js";
import type { EnrollmentState } from "./types.js";

interface ActivationResponse extends Omit<EnrollmentState, "apiBase"> {}

export function validateApiBase(value: string): string {
  const parsed = new URL(value);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("Use HTTPS, or HTTP only for a local development API.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("API address is invalid.");
  return parsed.origin;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `FocusGuard API returned ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function activate(
  apiBaseInput: string,
  enrollmentCode: string,
  name: string,
): Promise<EnrollmentState> {
  const apiBase = validateApiBase(apiBaseInput);
  const response = await fetch(`${apiBase}/v1/devices/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      enrollmentCode,
      name,
      platform: "chrome-extension",
      clientVersion: chrome.runtime.getManifest().version,
      capabilities: ["navigation", "offline-policy", "local-block-page", "level-1-2-override"],
    }),
  });
  const result = await parseResponse<ActivationResponse>(response);
  const existing = await getEnrollment();
  if (
    existing &&
    existing.signingKeyId === result.signingKeyId &&
    existing.signingPublicKey !== result.signingPublicKey
  ) {
    throw new Error("The enrolled server changed a signing key without rotation proof.");
  }
  const enrollment = { ...result, apiBase };
  await setEnrollment(enrollment);
  return enrollment;
}

async function refresh(enrollment: EnrollmentState): Promise<EnrollmentState> {
  const response = await fetch(`${enrollment.apiBase}/v1/devices/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: enrollment.deviceId, refreshToken: enrollment.refreshToken }),
  });
  const result = await parseResponse<ActivationResponse>(response);
  if (
    result.signingKeyId !== enrollment.signingKeyId ||
    result.signingPublicKey !== enrollment.signingPublicKey
  ) {
    throw new Error("Signing key rotation is not trusted by this client version.");
  }
  const next = { ...result, apiBase: enrollment.apiBase };
  await setEnrollment(next);
  return next;
}

export async function fetchSnapshot(): Promise<SignedPolicySnapshot> {
  let enrollment = await getEnrollment();
  if (!enrollment) throw new Error("This Chrome profile is not enrolled.");
  if (Date.parse(enrollment.accessExpiresAt) <= Date.now() + 30_000) enrollment = await refresh(enrollment);
  let response = await fetch(`${enrollment.apiBase}/v1/device/policy-snapshot`, {
    headers: { Authorization: `Bearer ${enrollment.accessToken}` },
  });
  if (response.status === 401) {
    enrollment = await refresh(enrollment);
    response = await fetch(`${enrollment.apiBase}/v1/device/policy-snapshot`, {
      headers: { Authorization: `Bearer ${enrollment.accessToken}` },
    });
  }
  return parseResponse<SignedPolicySnapshot>(response);
}
