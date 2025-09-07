import { NextRequest } from 'next/server'
import { placesPost } from '@/lib/google'

// Municipality suggestions within Hokkaido using Places Autocomplete (v1)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('q')?.trim() || ''
  // Sanitize: drop risky characters and clamp length to reduce abuse
  const input = raw.replace(/[<>"'`$\\]/g, '').slice(0, 50)
  if (!input) {
    return new Response(JSON.stringify({ predictions: [] }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  }

  // Hokkaido bounding box (approx)
  const rectangle = {
    low: { latitude: 41.35, longitude: 139.5 },
    high: { latitude: 45.55, longitude: 145.9 },
  }

  type AutocompleteResp = {
    predictions?: Array<{
      placePrediction?: {
        placeId?: string
        text?: { text?: string }
        types?: string[]
      }
    }>
  }

  let data: AutocompleteResp = {}
  try {
    data = await placesPost<AutocompleteResp>(
      'places:autocomplete',
      {
        input,
        languageCode: 'ja',
        regionCode: 'JP',
        locationBias: { rectangle },
        includedPrimaryTypes: ['locality', 'administrative_area_level_3', 'sublocality', 'postal_town'],
        strictTypeFiltering: true,
      },
      'predictions.placePrediction.placeId,predictions.placePrediction.text,predictions.placePrediction.types',
    )
  } catch (e) {
    // Log server-side only; return safe JSON
    console.error('Autocomplete error', e)
    return new Response(JSON.stringify({ municipalities: [], error: 'autocomplete_failed' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  }

  const municipalities = (data.predictions ?? [])
    .map((p) => p.placePrediction)
    .filter(Boolean)
    .filter((p) => (p!.types || []).some((t) => ['locality', 'administrative_area_level_3', 'sublocality', 'postal_town'].includes(t)))
    .map((p) => ({ id: p!.placeId!, name: p!.text?.text || '' }))
    .filter((x) => x.name)

  // dedupe by name
  const seen = new Set<string>()
  const unique = municipalities.filter((m) => (seen.has(m.name) ? false : (seen.add(m.name), true)))

  return new Response(JSON.stringify({ municipalities: unique }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
