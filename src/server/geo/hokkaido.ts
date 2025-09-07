import { Feature, FeatureCollection, Geometry } from 'geojson'
import { booleanIntersects, bbox as turfBbox, getSafeCentroid } from '@/lib/turf'
import fs from 'node:fs'
import path from 'node:path'

export type CityFeature = Feature<Geometry, { id: string; name: string; bbox?: [number, number, number, number] }>

let collection: FeatureCollection | null = null
let cities: CityFeature[] = []

function load() {
  if (collection) return
  const p = path.join(process.cwd(), 'data', 'admin', 'hokkaido.geojson')
  const raw = fs.readFileSync(p, 'utf-8')
  const json = JSON.parse(raw)
  collection = json
  cities = ((collection!.features) as CityFeature[]).map((f) => {
    const b = turfBbox(f)
    f.properties = { ...f.properties, bbox: b as any }
    return f
  })
}

export function getHokkaidoCities(): CityFeature[] {
  load()
  return cities
}

export function intersectingCities(iso: FeatureCollection) {
  load()
  const result: Array<{ id: string; name: string; center: { lat: number; lon: number }; bbox: [number, number, number, number] }>
    = []
  for (const city of cities) {
    let hit = false
    for (const f of iso.features) {
      try {
        if (booleanIntersects(city as any, f as any)) { hit = true; break }
      } catch {}
    }
    if (!hit) continue
    const cen = getSafeCentroid(city as any)
    const [lon, lat] = cen.geometry.coordinates as [number, number]
    result.push({ id: city.properties.id, name: city.properties.name, center: { lat, lon }, bbox: city.properties.bbox! })
  }
  return result
}

