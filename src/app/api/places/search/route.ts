import { NextRequest } from 'next/server'
import { placesPost, googleGet } from '@/lib/google'

type Mode = 'time' | 'distance'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawMunicipality = searchParams.get('municipality')?.trim() || ''
  // Sanitize municipality to prevent header/log injection and API abuse
  const municipality = rawMunicipality.replace(/[<>"'`$\\]/g, '').slice(0, 60)
  const modeParam = searchParams.get('mode')
  const mode: Mode = modeParam === 'distance' ? 'distance' : 'time'
  let value = Number(searchParams.get('value') || '0')
  if (!Number.isFinite(value)) value = 0
  value = Math.max(1, Math.min(value, mode === 'time' ? 300 : 500))
  const originStr = searchParams.get('origin')?.trim() // "lat,lng"

  // Tolerance bands
  const TIME_TOLERANCE_MIN = 15
  const DIST_TOLERANCE_KM = 10

  // Common shape for responses
  type PlaceLite = {
    id?: string
    displayName?: { text?: string }
    location?: { latitude: number; longitude: number }
    rating?: number
    userRatingCount?: number
    types?: string[]
    photos?: Array<{ name?: string }>
    googleMapsUri?: string
  }

  let candidates: PlaceLite[] = []

  if (municipality) {
    // Text search within municipality keywords
    type SearchTextResp = { places?: PlaceLite[] }
    const query = `${municipality} 北海道 日本 観光名所`
    const search = await placesPost<SearchTextResp>(
      'places:searchText',
      {
        textQuery: query,
        languageCode: 'ja',
        pageSize: 20,
        includedType: 'tourist_attraction',
        regionCode: 'JP',
      },
      'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.photos,places.types,places.googleMapsUri',
    )
    candidates = (search.places || []).filter((p) => p.displayName?.text)
  } else {
    // No municipality provided: derive reachable cities (up to 500km) and group results per city.
    if (!originStr) {
      return new Response(JSON.stringify({ groups: [] }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }
    const m = originStr.match(/^\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*$/)
    if (!m) {
      return new Response(JSON.stringify({ groups: [] }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }
    const oLat = parseFloat(m[1])
    const oLng = parseFloat(m[2])
    if (!Number.isFinite(oLat) || !Number.isFinite(oLng) || oLat < -90 || oLat > 90 || oLng < -180 || oLng > 180) {
      return new Response(JSON.stringify({ groups: [] }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }

    // Step 1: Collect candidate cities (localities) up to the requested reach using multi-center sampling
    const approxReachKm = mode === 'distance' ? value : Math.min(Math.max(Math.round(value * 0.7), 5), 500)
    const toRad = (d: number) => (d * Math.PI) / 180
    const toDeg = (r: number) => (r * 180) / Math.PI
    function movePoint(lat: number, lng: number, distanceKm: number, bearingDeg: number) {
      const R = 6371
      const brng = toRad(bearingDeg)
      const φ1 = toRad(lat)
      const λ1 = toRad(lng)
      const δ = distanceKm / R
      const sinφ1 = Math.sin(φ1)
      const cosφ1 = Math.cos(φ1)
      const sinδ = Math.sin(δ)
      const cosδ = Math.cos(δ)
      const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(brng)
      const φ2 = Math.asin(sinφ2)
      const y = Math.sin(brng) * sinδ * cosφ1
      const x = cosδ - sinφ1 * sinφ2
      const λ2 = λ1 + Math.atan2(y, x)
      return { lat: toDeg(φ2), lng: toDeg(λ2) }
    }

    const centers: Array<{ latitude: number; longitude: number }> = []
    if (approxReachKm <= 50) {
      centers.push({ latitude: oLat, longitude: oLng })
    } else {
      const rings = Math.max(1, Math.ceil(approxReachKm / 125)) // ~ up to 41 calls at 500km
      const ringStep = approxReachKm / rings
      const bearings = [0, 45, 90, 135, 180, 225, 270, 315]
      centers.push({ latitude: oLat, longitude: oLng })
      for (let r = 1; r <= rings; r++) {
        const dist = r * ringStep
        for (const b of bearings) {
          const p = movePoint(oLat, oLng, dist, b)
          centers.push({ latitude: p.lat, longitude: p.lng })
        }
      }
    }

    type CityNearbyResp = { places?: PlaceLite[] }
    const cityMap = new Map<string, PlaceLite>() // key by displayName
    for (const c of centers) {
      const resp = await placesPost<CityNearbyResp>(
        'places:searchNearby',
        {
          languageCode: 'ja',
          maxResultCount: 20,
          includedTypes: ['locality'],
          locationRestriction: { circle: { center: { latitude: c.latitude, longitude: c.longitude }, radius: 50000 } },
        },
        'places.id,places.displayName,places.location',
      )
      for (const p of resp.places || []) {
        const name = p.displayName?.text || ''
        if (!name || !p.location?.latitude || !p.location?.longitude) continue
        if (!cityMap.has(name)) cityMap.set(name, p)
      }
      // Stop early if we already have a reasonable set
      if (cityMap.size >= 80) break
    }
    const cityCandidates = Array.from(cityMap.values())

    // Step 2: Filter reachable cities using Distance Matrix
    // Step 2: Filter reachable cities using Distance Matrix (chunked by max 25 destinations)
    type Metric = { idx: number; minutes: number; km: number }
    const metrics: Metric[] = []
    const chunkSize = 25
    for (let i = 0; i < cityCandidates.length; i += chunkSize) {
      const chunk = cityCandidates.slice(i, i + chunkSize)
      const destinations = chunk.map((c) => `${c.location!.latitude},${c.location!.longitude}`).join('|')
      const dm = await googleGet<any>('https://maps.googleapis.com/maps/api/distancematrix/json', {
        origins: `${oLat},${oLng}`,
        destinations,
        mode: 'driving',
        language: 'ja',
      })
      const elements = dm.rows?.[0]?.elements || []
      elements.forEach((el: any, j: number) => {
        if (el && el.status === 'OK') {
          metrics.push({ idx: i + j, minutes: (el.duration?.value || 0) / 60, km: (el.distance?.value || 0) / 1000 })
        }
      })
    }
    const reachableIdx = metrics
      .filter((m) => (mode === 'time'
        ? m.minutes >= Math.max(0, value - TIME_TOLERANCE_MIN) && m.minutes <= value + TIME_TOLERANCE_MIN
        : m.km >= Math.max(0, value - DIST_TOLERANCE_KM) && m.km <= value + DIST_TOLERANCE_KM))
      .map((m) => m.idx)
    const reachableCitiesRaw = reachableIdx.map((i) => cityCandidates[i]).filter(Boolean)
    // Dedupe by city name and limit to avoid excessive API calls
    const seenCity = new Set<string>()
    // sort by metric ascending (minutes or km)
    const metricMap = new Map<number, number>()
    metrics.forEach((m) => metricMap.set(m.idx, mode === 'time' ? m.minutes : m.km))
    const sortedReachable = reachableIdx
      .sort((a, b) => (metricMap.get(a)! - metricMap.get(b)!))
      .map((i) => cityCandidates[i])
    const reachableCities = sortedReachable.filter((c) => {
      const name = c.displayName?.text || ''
      if (!name || seenCity.has(name)) return false
      seenCity.add(name)
      return true
    }).slice(0, 8)

    // Step 3: For each reachable city, find the city hall and use it as center to fetch tourist attractions within 50km
    const groups: Array<{ city: { id: string; name: string; lat: number; lng: number; hallLat: number; hallLng: number }; spots: any[] }> = []
    for (const city of reachableCities) {
      const cLat = city.location!.latitude!
      const cLng = city.location!.longitude!
      const cityName = city.displayName!.text!

      // 3-a) Try to find the city hall by text search first
      type HallTextResp = { places?: PlaceLite[] }
      let hallLat = cLat
      let hallLng = cLng
      try {
        const hallText = await placesPost<HallTextResp>(
          'places:searchText',
          {
            textQuery: `${cityName} 市役所`,
            languageCode: 'ja',
            regionCode: 'JP',
            pageSize: 1,
            // Prefer exact city hall type when available
            includedType: 'city_hall',
          },
          'places.location,places.displayName,places.id',
        )
        const hall = (hallText.places || [])[0]
        if (hall?.location?.latitude && hall.location.longitude) {
          hallLat = hall.location.latitude
          hallLng = hall.location.longitude
        } else {
          // 3-b) Fallback: Nearby search for city_hall/local_government_office around the city center
          type HallNearbyResp = { places?: PlaceLite[] }
          const hallNearby = await placesPost<HallNearbyResp>(
            'places:searchNearby',
            {
              languageCode: 'ja',
              maxResultCount: 5,
              includedTypes: ['city_hall', 'local_government_office'],
              locationRestriction: {
                circle: { center: { latitude: cLat, longitude: cLng }, radius: 15000 },
              },
            },
            'places.location,places.displayName,places.id',
          )
          const hall2 = (hallNearby.places || [])[0]
          if (hall2?.location?.latitude && hall2.location.longitude) {
            hallLat = hall2.location.latitude
            hallLng = hall2.location.longitude
          }
        }
      } catch (e) {
        // ignore and fallback to city center
      }

      type NearbyResp = { places?: PlaceLite[] }
      const nearby = await placesPost<NearbyResp>(
        'places:searchNearby',
        {
          languageCode: 'ja',
          maxResultCount: 20,
          includedTypes: ['tourist_attraction'],
          locationRestriction: {
            circle: { center: { latitude: hallLat, longitude: hallLng }, radius: 10000 },
          },
        },
        'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.photos,places.types,places.googleMapsUri,places.formattedAddress',
      )
      const citySpots = (nearby.places || []).filter((p) => p.displayName?.text)
      groups.push({
        city: { id: city.id!, name: cityName, lat: cLat, lng: cLng, hallLat, hallLng },
        spots: citySpots.map((p) => ({
          id: p.id!,
          name: p.displayName?.text || '',
          lat: p.location?.latitude,
          lng: p.location?.longitude,
          rating: p.rating,
          reviews: p.userRatingCount,
          photoName: p.photos?.[0]?.name || null,
          mapsUrl: p.googleMapsUri,
          address: (p as any).formattedAddress || null,
        })),
      })
    }
    // De-duplicate spots across groups: prefer the group whose city name appears in the spot's address
    const bySpot: Map<string, number[]> = new Map()
    groups.forEach((g, gi) => {
      g.spots.forEach((s) => {
        const arr = bySpot.get(s.id) || []
        arr.push(gi)
        bySpot.set(s.id, arr)
      })
    })
    bySpot.forEach((gis, spotId) => {
      if (gis.length <= 1) return
      // choose preferred group index
      let preferredIndex = gis[0]
      const anyGroupIndex = gis[0]
      // find the spot object to read address
      let address: string | null = null
      for (const gi of gis) {
        const s = groups[gi].spots.find((sp) => sp.id === spotId)
        if (s && typeof (s as any).address === 'string') {
          address = (s as any).address as string
          break
        }
      }
      if (address) {
        for (const gi of gis) {
          const cityName = groups[gi].city.name
          if (address.includes(cityName)) {
            preferredIndex = gi
            break
          }
        }
      } else {
        preferredIndex = anyGroupIndex
      }
      // remove from other groups
      for (const gi of gis) {
        if (gi === preferredIndex) continue
        const g = groups[gi]
        g.spots = g.spots.filter((sp) => sp.id !== spotId)
      }
    })

    return new Response(JSON.stringify({ groups }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  }

  let filtered = candidates

  // If origin and value provided, filter using Distance Matrix (single request with multiple destinations)
  if (originStr && value > 0 && candidates.length > 0) {
    const m = originStr.match(/^\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*$/)
    if (!m) {
      return new Response(JSON.stringify({ spots: [] }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }
    const lat = parseFloat(m[1])
    const lng = parseFloat(m[2])
    // Basic lat/lng bounds check
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return new Response(JSON.stringify({ spots: [] }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }
    const destinations = candidates.map((p) => `place_id:${p.id}`).join('|')
    const dm = await googleGet<any>('https://maps.googleapis.com/maps/api/distancematrix/json', {
      origins: `${lat},${lng}`,
      destinations,
      mode: 'driving',
      language: 'ja',
    })

    const elements = dm.rows?.[0]?.elements || []
    filtered = candidates.filter((_, i) => {
      const el = elements[i]
      if (!el || el.status !== 'OK') return false
      if (mode === 'time') {
        const minutes = (el.duration?.value || 0) / 60
        return minutes >= Math.max(0, value - TIME_TOLERANCE_MIN) && minutes <= value + TIME_TOLERANCE_MIN
      } else {
        const km = (el.distance?.value || 0) / 1000
        return km >= Math.max(0, value - DIST_TOLERANCE_KM) && km <= value + DIST_TOLERANCE_KM
      }
    })
      // Sort by rating desc then by userRatingCount desc
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.userRatingCount || 0) - (a.userRatingCount || 0))
  }

  const spots = filtered.map((p) => ({
    id: p.id!,
    name: p.displayName?.text || '',
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    rating: p.rating,
    reviews: p.userRatingCount,
    photoName: p.photos?.[0]?.name || null,
    mapsUrl: p.googleMapsUri,
  }))

  return new Response(JSON.stringify({ spots }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
