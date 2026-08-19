import {
  PolicySnapshotPayloadSchema,
  SignedPolicySnapshotSchema,
  type PolicySnapshotPayload,
  type SignedPolicySnapshot,
} from "@focusguard/schemas";
import { canonicalJson } from "./canonical-json.js";

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  if (typeof atob === "function") {
    const decoded = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    return decoded.buffer as ArrayBuffer;
  }
  throw new Error("base64url decoding is unavailable");
}

export interface SnapshotVerificationContext {
  expectedDeviceId: string;
  expectedOrganizationId: string;
  minimumVersion: number;
  now: Date;
  publicKeyBase64Url: string;
}

export async function verifyPolicySnapshot(
  value: unknown,
  context: SnapshotVerificationContext,
): Promise<PolicySnapshotPayload> {
  const snapshot: SignedPolicySnapshot = SignedPolicySnapshotSchema.parse(value);
  const payload = PolicySnapshotPayloadSchema.parse(snapshot.payload);
  if (payload.deviceId !== context.expectedDeviceId || payload.organizationId !== context.expectedOrganizationId) {
    throw new Error("snapshot subject mismatch");
  }
  if (payload.snapshotVersion < context.minimumVersion) throw new Error("snapshot downgrade rejected");
  if (context.now.getTime() >= Date.parse(payload.validUntil)) throw new Error("snapshot has expired");

  const publicKey = await crypto.subtle.importKey(
    "raw",
    decodeBase64Url(context.publicKeyBase64Url),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    publicKey,
    decodeBase64Url(snapshot.signature),
    new TextEncoder().encode(canonicalJson(payload)),
  );
  if (!valid) throw new Error("snapshot signature is invalid");
  return payload;
}
