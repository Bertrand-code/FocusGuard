const API_ORIGIN = process.env.NEXT_PUBLIC_FOCUSGUARD_API_ORIGIN ?? "http://localhost:8000";

export async function api<T>(path: string, options: RequestInit = {}, csrfToken?: string): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...options.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as (T & { detail?: string }) | null;
  if (!response.ok) throw new Error(body?.detail ?? `Request failed (${response.status})`);
  return body as T;
}
