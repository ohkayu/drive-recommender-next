import bbox from '@turf/bbox'
import booleanIntersects from '@turf/boolean-intersects'
import centroid from '@turf/centroid'
import pointOnFeature from '@turf/point-on-feature'
import { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon, Position } from 'geojson'

export { bbox, booleanIntersects, centroid, pointOnFeature }

export function ensureFeatureCollection(g: any): FeatureCollection {
  if (!g) return { type: 'FeatureCollection', features: [] }
  if (g.type === 'FeatureCollection') return g as FeatureCollection
  if (g.type === 'Feature') return { type: 'FeatureCollection', features: [g as Feature] }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: g as Geometry, properties: {} }] }
}

export function getBboxOfFeature(f: Feature<Geometry>) {
  return bbox(f)
}

export function getSafeCentroid(f: Feature<Geometry>) {
  try {
    const c = centroid(f)
    return c
  } catch {
    return pointOnFeature(f)
  }
}

export function polygonFromBbox(b: [number, number, number, number]): Feature<Polygon> {
  const [minX, minY, maxX, maxY] = b
  const coords: Position[] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ]
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }
}

