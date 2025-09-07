"use client";
import { useEffect, useRef } from "react";

type LatLng = { lat: number; lng: number };
type CityMarker = { id: string; name: string; position: LatLng };
type SpotMarker = { id: string; name: string; position: LatLng };

type Props = {
  center: LatLng | null;
  iso?: any | null; // GeoJSON FeatureCollection
  cities?: CityMarker[];
  spots?: SpotMarker[];
  onCityClick?: (id: string) => void;
};

export default function MapView({ center, iso, cities = [], spots = [], onCityClick }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const cityMarkersRef = useRef<any[]>([]);
  const dataLayerRef = useRef<any>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !ref.current || !center) return;
    const w = window as any;
    const ensureScript = () => new Promise<void>((resolve, reject) => {
      if (w.google && w.google.maps) return resolve();
      const existing = document.querySelector('script[data-gmaps-loader="true"]') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
        return;
      }
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=ja&region=JP&v=weekly`;
      s.async = true;
      s.defer = true;
      s.dataset.gmapsLoader = 'true';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load Google Maps script'));
      document.head.appendChild(s);
    });
    ensureScript().then(() => {
      const g = (window as any).google;
      if (!mapRef.current) {
        mapRef.current = new g.maps.Map(ref.current as HTMLDivElement, {
          center,
          zoom: 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        dataLayerRef.current = new g.maps.Data({ map: mapRef.current });
      } else {
        mapRef.current.setCenter(center);
      }
    });
  }, [center]);

  // Validate GeoJSON FeatureCollection for Data layer (polygons only)
  function filterPolygonFC(fc: any) {
    try {
      if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return null;
      const feats = fc.features.filter((f: any) =>
        f && f.type === 'Feature' && f.geometry && (
          f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
        )
      );
      if (feats.length === 0) return null;
      return { type: 'FeatureCollection', features: feats };
    } catch { return null; }
  }

  // Draw iso polygon
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapRef.current || !dataLayerRef.current) return;
    const layer = dataLayerRef.current as any;
    layer.forEach((f: any) => layer.remove(f));
    const valid = filterPolygonFC(iso);
    if (!valid) return;
    try {
      layer.addGeoJson(valid);
      layer.setStyle({ fillColor: '#1d4ed8', fillOpacity: 0.15, strokeColor: '#1d4ed8', strokeWeight: 2 });
    } catch (_) {
      // swallow invalid geometry to avoid runtime crash
    }
  }, [iso]);

  // Draw city markers
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapRef.current) return;
    cityMarkersRef.current.forEach((m) => m.setMap(null));
    cityMarkersRef.current = [];
    for (const c of cities) {
      const m = new g.maps.Marker({ position: c.position, map: mapRef.current, label: { text: '市', color: 'white' } });
      if (onCityClick) {
        m.addListener('click', () => onCityClick(c.id));
      }
      cityMarkersRef.current.push(m);
    }
  }, [cities, onCityClick]);

  // Draw spot markers
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    for (const s of spots) {
      const m = new g.maps.Marker({ position: s.position, map: mapRef.current });
      markersRef.current.push(m);
    }
  }, [spots]);

  return <div ref={ref} className="w-full h-96 rounded border" />;
}
