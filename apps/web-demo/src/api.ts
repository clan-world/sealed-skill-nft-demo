const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET' };
  const res = await fetch(`${API_BASE}${path}`, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? json.reason ?? `HTTP ${res.status}`);
  return json as T;
}

export { API_BASE };
