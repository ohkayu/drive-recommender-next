export const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_API_KEY) {
  // Do not throw at import time in production; endpoints will validate per-request.
}

export function assertApiKey() {
  if (!GOOGLE_API_KEY) {
    throw new Error('Missing GOOGLE_MAPS_API_KEY environment variable');
  }
}

export async function placesPost<T>(path: string, body: unknown, fieldMask?: string): Promise<T> {
  assertApiKey();
  const url = `https://places.googleapis.com/v1/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY as string,
      ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
    },
    body: JSON.stringify(body),
    // Next.js: opt out of caching for dynamic data
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function placesGet<T>(path: string, fieldMask?: string, searchParams?: Record<string, string>): Promise<T> {
  assertApiKey();
  const sp = new URLSearchParams(searchParams ?? {});
  const url = `https://places.googleapis.com/v1/${path}${sp.toString() ? `?${sp.toString()}` : ''}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': GOOGLE_API_KEY as string,
      ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function googleGet<T>(url: string, params: Record<string, string | number | undefined>): Promise<T> {
  assertApiKey();
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) sp.set(k, String(v));
  }
  sp.set('key', GOOGLE_API_KEY as string);
  const res = await fetch(`${url}?${sp.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API error ${res.status}: ${text}`);
  }
  return res.json();
}

