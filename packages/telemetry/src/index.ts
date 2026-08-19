const FORBIDDEN_KEYS = /(?:url|path|query|fragment|title|content|body|token|password|cookie|authorization|referrer|form)/i;

export type SafeDiagnostic = {
  component: "api" | "extension" | "web" | "policy-engine";
  errorClass: string;
  version: string;
  operation: string;
};

export function assertAllowlistedDiagnostic(value: Record<string, unknown>): asserts value is SafeDiagnostic {
  const allowed = new Set(["component", "errorClass", "version", "operation"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key) || FORBIDDEN_KEYS.test(key)) throw new Error(`telemetry field is not allowlisted: ${key}`);
  }
}
