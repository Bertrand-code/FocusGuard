const HTTP_SCHEMES = new Set(["http:", "https:"]);

function cleanHostname(hostname: string): string | null {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized.length > 253 || /\s/.test(normalized)) return null;
  return normalized;
}

export function normalizeNavigableUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!HTTP_SCHEMES.has(url.protocol)) return null;
    return cleanHostname(url.hostname);
  } catch {
    return null;
  }
}

export function normalizeDomain(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || candidate.includes("/") || candidate.includes("@")) return null;
  try {
    const url = new URL(`http://${candidate}`);
    if (url.username || url.password || url.port) return null;
    return cleanHostname(url.hostname);
  } catch {
    return null;
  }
}

export function domainMatches(hostname: string, configuredDomain: string): boolean {
  const wildcard = configuredDomain.startsWith("*.");
  const rawBase = wildcard ? configuredDomain.slice(2) : configuredDomain;
  const base = normalizeDomain(rawBase);
  if (!base) return false;

  if (hostname === base) return !wildcard || hostname.split(".").length > base.split(".").length;
  return hostname.endsWith(`.${base}`);
}
