import { NextRequest } from 'next/server'
import { TTLCache, readEnvInt } from '@/server/cache'
import { consumeHereQuota } from '@/server/quota'
import { fetchIsochrone, HERE_API_KEY, toGeoJSONFromHere } from '@/lib/here'
import { ensureFeatureCollection } from '@/lib/turf'
import { intersectingCities } from '@/server/geo/hokkaido'

const isoCache = new TTLCache<any>(readEnvInt('ISO_CACHE_TTL_SEC', 1800))

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat') || '')
  const lon = Number(searchParams.get('lon') || '')
  const time = searchParams.get('time')
  const distance = searchParams.get('distance')

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: 'invalid_coord' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  const hasTime = time !== null && time !== ''
  const hasDist = distance !== null && distance !== ''
  if ((hasTime && hasDist) || (!hasTime && !hasDist)) {
    return new Response(JSON.stringify({ error: 'provide_time_or_distance' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  const timeMin = hasTime ? Number(time) : undefined
  const distanceKm = hasDist ? Number(distance) : undefined
  if (timeMin !== undefined && (!Number.isFinite(timeMin) || timeMin <= 0 || timeMin > 300)) {
    return new Response(JSON.stringify({ error: 'invalid_time' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  if (distanceKm !== undefined && (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 500)) {
    return new Response(JSON.stringify({ error: 'invalid_distance' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  // Round coords to 4 decimals to stabilize cache key
  const latR = Math.round(lat * 1e4) / 1e4
  const lonR = Math.round(lon * 1e4) / 1e4
  const key = `iso|${latR}|${lonR}|${timeMin ?? ''}|${distanceKm ?? ''}`
  const cached = isoCache.get(key)
  if (cached) {
    return new Response(JSON.stringify(cached), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  }

  // Quota (per client IP)
  const ip = req.headers.get('x-forwarded-for') || 'local'
  const q = consumeHereQuota(ip)
  if (!q.ok) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Content-Type': 'application/json' } })
  }

  if (!HERE_API_KEY) {
    return new Response(JSON.stringify({ error: 'missing_here_api_key' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const iso = await fetchIsochrone({ lat: latR, lon: lonR, timeMin, distanceKm })
    // Convert HERE payload to GeoJSON FeatureCollection if needed
    let isoFc = ensureFeatureCollection(toGeoJSONFromHere(iso))
    if (!isoFc || !Array.isArray(isoFc.features)) {
      isoFc = { type: 'FeatureCollection', features: [] }
    }
    const cities = intersectingCities(isoFc)
    const payload = { iso: isoFc, cities }
    isoCache.set(key, payload)
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'upstream_failed', detail: String(e?.message || e) }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}
