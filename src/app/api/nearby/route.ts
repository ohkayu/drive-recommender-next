import { NextRequest } from 'next/server'
import { TTLCache, readEnvInt } from '@/server/cache'
import { consumePlacesQuota } from '@/server/quota'
import { placesPost } from '@/lib/google'

const nearbyCache = new TTLCache<any>(readEnvInt('NEARBY_CACHE_TTL_SEC', 1200))

type Body = {
  cityId: string
  center: { lat: number; lon: number }
  types?: string[]
  cityName?: string // for sorting preference
}

const DEFAULT_TYPES = [
  'tourist_attraction',
  'museum',
  'park',
  'art_gallery',
  'zoo',
  'aquarium',
]

function sanitizeTypes(types?: string[]) {
  const arr = Array.isArray(types) ? types : DEFAULT_TYPES
  return arr.filter((t) => /^(?:[a-z_]+)$/.test(t))
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'local'
  const q = consumePlacesQuota(ip)
  if (!q.ok) return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Content-Type': 'application/json' } })

  let body: Body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  const cityId = (body.cityId || '').slice(0, 80)
  const lat = Number(body.center?.lat)
  const lon = Number(body.center?.lon)
  const types = sanitizeTypes(body.types)
  const cityName = (body.cityName || '').slice(0, 50)
  if (!cityId || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: 'invalid_params' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const key = `nearby|${cityId}|${types.join(',')}`
  const cached = nearbyCache.get(key)
  if (cached) {
    return new Response(JSON.stringify(cached), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  }

  // One retry for 429/5xx
  async function run() {
    const resp = await placesPost<any>(
      'places:searchNearby',
      {
        languageCode: 'ja',
        maxResultCount: 20,
        includedTypes: types,
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lon }, radius: 10000 },
        },
      },
      'places.name,places.displayName,places.formattedAddress,places.location,places.primaryType,places.rating,places.userRatingCount,places.googleMapsUri',
    )
    return resp
  }

  let data
  try {
    try {
      data = await run()
    } catch (e: any) {
      // retry once
      data = await run()
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'upstream_failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }

  const items = (data.places || []).map((p: any) => {
    const namePath: string = p.name || '' // e.g. "places/ChIJ..."
    const placeId = namePath.split('/').pop() || ''
    const addr = p.formattedAddress || ''
    return {
      placeId,
      name: p.displayName?.text || '',
      location: { lat: p.location?.latitude, lon: p.location?.longitude },
      formattedAddress: addr,
      primaryType: p.primaryType || null,
      rating: p.rating || null,
      userRatingsTotal: p.userRatingsTotal ?? p.userRatingCount ?? null,
      googleMapsUrl: p.googleMapsUri || null,
    }
  })

  // uniq by placeId
  const uniqMap = new Map<string, any>()
  for (const it of items) {
    if (!it.placeId) continue
    if (!uniqMap.has(it.placeId)) uniqMap.set(it.placeId, it)
  }
  let results = Array.from(uniqMap.values())

  // City name priority
  if (cityName) {
    results = results.sort((a, b) => {
      const aMatch = a.formattedAddress?.includes(cityName) ? 1 : 0
      const bMatch = b.formattedAddress?.includes(cityName) ? 1 : 0
      if (aMatch !== bMatch) return bMatch - aMatch
      // Secondary: rating desc then reviews desc
      return (b.rating || 0) - (a.rating || 0) || (b.userRatingsTotal || 0) - (a.userRatingsTotal || 0)
    })
  }

  const payload = { cityId, results }
  nearbyCache.set(key, payload)
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
