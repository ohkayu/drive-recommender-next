import { NextRequest } from 'next/server'
import { googleGet } from '@/lib/google'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat') || '')
  const lng = Number(searchParams.get('lng') || '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new Response(JSON.stringify({ error: 'invalid_coord' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const data = await googleGet<any>('https://maps.googleapis.com/maps/api/geocode/json', {
      latlng: `${lat},${lng}`,
      language: 'ja',
    })
    const addr = Array.isArray(data.results) && data.results[0]?.formatted_address
    return new Response(JSON.stringify({ address: addr || '' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'upstream_failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}

