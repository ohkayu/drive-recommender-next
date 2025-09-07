export const HERE_API_KEY = process.env.HERE_API_KEY

export function assertHereKey() {
  if (!HERE_API_KEY) throw new Error('Missing HERE_API_KEY')
}

export type IsoParams = {
  lat: number
  lon: number
  timeMin?: number // minutes
  distanceKm?: number
}

export async function fetchIsochrone({ lat, lon, timeMin, distanceKm }: IsoParams) {
  assertHereKey()
  const base = 'https://isoline.router.hereapi.com/v8/isolines'
  const sp = new URLSearchParams()
  sp.set('transportMode', 'car')
  sp.set('origin', `${lat},${lon}`)
  if (timeMin) {
    sp.set('range[type]', 'time')
    sp.set('range[values]', String(timeMin * 60))
  } else if (distanceKm) {
    sp.set('range[type]', 'distance')
    sp.set('range[values]', String(Math.round(distanceKm * 1000)))
  } else {
    throw new Error('timeMin or distanceKm is required')
  }
  // Note: 'return' is not supported for isolines v8; polygons included by default
  sp.set('apiKey', HERE_API_KEY as string)

  const url = `${base}?${sp.toString()}`
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`HERE isoline error ${res.status}: ${t}`)
  }
  const json = await res.json()
  return json
}

export function toGeoJSONFromHere(raw: any): any {
  if (!raw) return { type: 'FeatureCollection', features: [] }
  if (raw.type === 'FeatureCollection') return raw
  const features: any[] = []
  try {
    const isolines = Array.isArray(raw.isolines) ? raw.isolines : []
    for (const iso of isolines) {
      const polys = Array.isArray(iso.polygons) ? iso.polygons : []
      for (const p of polys) {
        const outer = p.outer
        const inners = Array.isArray(p.inner) ? p.inner : []
        if (!outer || !outer.type || !Array.isArray(outer.coordinates)) continue
        const outerRing = closeRing(outer.coordinates)
        const holes = inners
          .filter((h: any) => h && Array.isArray(h.coordinates))
          .map((h: any) => closeRing(h.coordinates))
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [outerRing, ...holes] },
          properties: { range: iso.range }
        })
      }
    }
  } catch {}
  return { type: 'FeatureCollection', features }
}

function closeRing(coords: any[]): any[] {
  if (!coords || coords.length === 0) return coords
  const first = coords[0]
  const last = coords[coords.length - 1]
  if (first && last && first[0] === last[0] && first[1] === last[1]) return coords
  return [...coords, first]
}
