import { readEnvInt } from '@/server/cache'

type Window = 'hourly' | 'daily'

class CounterWindow {
  private counters = new Map<string, { count: number; resetAt: number }>()
  constructor(private windowMs: number, private limit: number) {}

  tryConsume(key: string): { ok: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const cw = this.counters.get(key)
    if (!cw || now >= cw.resetAt) {
      const resetAt = now + this.windowMs
      this.counters.set(key, { count: 1, resetAt })
      return { ok: true, remaining: this.limit - 1, resetAt }
    }
    if (cw.count >= this.limit) {
      return { ok: false, remaining: 0, resetAt: cw.resetAt }
    }
    cw.count += 1
    return { ok: true, remaining: this.limit - cw.count, resetAt: cw.resetAt }
  }
}

const hourMs = 60 * 60 * 1000
const dayMs = 24 * hourMs

const HERE_HOURLY_LIMIT = readEnvInt('HERE_HOURLY_LIMIT', 300)
const HERE_DAILY_LIMIT = readEnvInt('HERE_DAILY_LIMIT', 2500)
const PLACES_HOURLY_LIMIT = readEnvInt('PLACES_HOURLY_LIMIT', 500)
const PLACES_DAILY_LIMIT = readEnvInt('PLACES_DAILY_LIMIT', 5000)

const hereHourly = new CounterWindow(hourMs, HERE_HOURLY_LIMIT)
const hereDaily = new CounterWindow(dayMs, HERE_DAILY_LIMIT)
const placesHourly = new CounterWindow(hourMs, PLACES_HOURLY_LIMIT)
const placesDaily = new CounterWindow(dayMs, PLACES_DAILY_LIMIT)

export function consumeHereQuota(ip: string) {
  const h = hereHourly.tryConsume(ip)
  const d = hereDaily.tryConsume(ip)
  return { ok: h.ok && d.ok, hourly: h, daily: d }
}

export function consumePlacesQuota(ip: string) {
  const h = placesHourly.tryConsume(ip)
  const d = placesDaily.tryConsume(ip)
  return { ok: h.ok && d.ok, hourly: h, daily: d }
}

