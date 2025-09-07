"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  origin?: { lat: number; lng: number } | null;
  destinationPlaceId?: string | null;
};

export default function Map({ origin, destinationPlaceId }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [info, setInfo] = useState<{ durationText?: string; distanceText?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setError('Google Maps API キーが未設定です（NEXT_PUBLIC_GOOGLE_MAPS_API_KEY）');
      return;
    }
    if (!ref.current || !origin || !destinationPlaceId) return;

    let renderer: any = null;

    const loadScript = () => new Promise<void>((resolve, reject) => {
      const w = window as any;
      if (w.google && w.google.maps) return resolve();
      const existing = document.querySelector('script[data-gmaps-loader="true"]') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
        return;
      }
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=ja&region=JP&v=weekly&libraries=places`;
      s.async = true;
      s.defer = true;
      s.dataset.gmapsLoader = 'true';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load Google Maps script'));
      document.head.appendChild(s);
    });

    loadScript().then(async () => {
      const g = (window as any).google;
      if (!g || !g.maps) {
        setError('Google Maps の読み込みに失敗しました');
        return;
      }
      const map = new g.maps.Map(ref.current as HTMLDivElement, {
        center: origin,
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      const service = new g.maps.DirectionsService();
      renderer = new g.maps.DirectionsRenderer({ map });
      try {
        const res = await service.route({
          origin,
          destination: { placeId: destinationPlaceId },
          travelMode: g.maps.TravelMode.DRIVING,
          provideRouteAlternatives: false,
        });
        renderer.setDirections(res);
        const leg = res.routes?.[0]?.legs?.[0];
        if (leg) setInfo({ durationText: leg.duration?.text, distanceText: leg.distance?.text });
      } catch (e: any) {
        setError('経路の取得に失敗しました');
      }
    }).catch((e) => {
      setError('Google Maps スクリプトの読み込みに失敗しました');
    });

    return () => {
      if (renderer) renderer.setMap(null);
    };
  }, [origin, destinationPlaceId]);

  return (
    <div className="w-full space-y-2">
      <div ref={ref} className="w-full h-80 rounded border border-black/10 dark:border-white/15" />
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}
      {info && (
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <span className="mr-3">所要時間: {info.durationText || "-"}</span>
          <span>距離: {info.distanceText || "-"}</span>
        </div>
      )}
    </div>
  );
}
