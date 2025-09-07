type Entry<T> = { value: T; expiresAt: number }

export class TTLCache<T = unknown> {
  private store = new Map<string, Entry<T>>()
  constructor(private defaultTtlSec: number) {}

  get(key: string): T | undefined {
    const e = this.store.get(key)
    if (!e) return undefined
    if (Date.now() > e.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return e.value
  }

  set(key: string, value: T, ttlSec?: number) {
    const ttl = (ttlSec ?? this.defaultTtlSec) * 1000
    this.store.set(key, { value, expiresAt: Date.now() + ttl })
  }

  has(key: string) {
    return this.get(key) !== undefined
  }
}

export function readEnvInt(name: string, fallback: number) {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

