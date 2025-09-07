import { NextRequest } from 'next/server'
import { GOOGLE_API_KEY } from '@/lib/google'

// Proxy Places Photo media to avoid exposing API key in client
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawName = searchParams.get('name') || '' // e.g. places/ChIJ.../photos/AbCd
  // Very conservative sanitization: allow path-like safe chars
  const name = rawName.replace(/[^A-Za-z0-9_\-\/]/g, '').slice(0, 200)
  const maxHeightPxRaw = searchParams.get('maxHeightPx') || '480'
  const maxHeightPxNum = Math.max(100, Math.min(Number(maxHeightPxRaw) || 480, 1600))
  if (!name) return new Response('name is required', { status: 400, headers: { 'Cache-Control': 'no-store' } })
  if (!GOOGLE_API_KEY) return new Response('API key not configured', { status: 500, headers: { 'Cache-Control': 'no-store' } })

  const url = `https://places.googleapis.com/v1/${encodeURI(name)}/media?maxHeightPx=${maxHeightPxNum}&key=${GOOGLE_API_KEY}`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Cache-Control': 'no-store' } })
  }

  // Stream/pipe through with original content-type
  const headers = new Headers(res.headers)
  // Remove any cross-origin headers that might be blocked
  headers.delete('set-cookie')
  headers.set('Cache-Control', 'no-store')
  return new Response(res.body, { status: 200, headers })
}
