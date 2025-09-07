import { NextRequest } from 'next/server'
import { placesGet } from '@/lib/google'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('id')?.trim() || ''
  // Place ID pattern is typically alphanumeric with _ and -; strip risky chars and clamp
  const id = raw.replace(/[<>"'`$\\]/g, '').slice(0, 120)
  if (!id) return new Response(JSON.stringify({}), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

  type DetailsResp = {
    id?: string
    displayName?: { text?: string }
    formattedAddress?: string
    googleMapsUri?: string
    rating?: number
    userRatingCount?: number
    reviews?: Array<{
      rating?: number
      text?: { text?: string }
      publishTime?: string
      authorAttribution?: { displayName?: string }
    }>
    photos?: Array<{ name?: string }>
  }

  const data = await placesGet<DetailsResp>(`places/${id}`,
    'id,displayName,formattedAddress,googleMapsUri,rating,userRatingCount,reviews,photos')

  return new Response(JSON.stringify({
    id: data.id,
    name: data.displayName?.text,
    address: data.formattedAddress,
    rating: data.rating,
    reviewsCount: data.userRatingCount,
    reviews: (data.reviews || []).slice(0, 5).map(r => ({
      author: r.authorAttribution?.displayName,
      rating: r.rating,
      text: r.text?.text,
      time: r.publishTime,
    })),
    photoName: data.photos?.[0]?.name || null,
    mapsUrl: data.googleMapsUri,
  }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
