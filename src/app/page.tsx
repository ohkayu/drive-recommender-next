"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Mode = "time" | "distance";

type Municipality = { id: string; name: string };
type Spot = {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
  rating?: number;
  reviews?: number;
  photoName?: string | null;
  mapsUrl?: string;
};

type Details = {
  id?: string;
  name?: string;
  address?: string;
  rating?: number;
  reviewsCount?: number;
  reviews?: Array<{ author?: string; rating?: number; text?: string; time?: string }>;
  photoName?: string | null;
  mapsUrl?: string;
};

type CityGroup = {
  city: { id: string; name: string; lat: number; lng: number };
  spots: Spot[];
};

export default function Home() {
  const [mode, setMode] = useState<Mode>("time");
  const [value, setValue] = useState<number>(30);
  const [valueText, setValueText] = useState<string>("30");
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [originAddress, setOriginAddress] = useState<string>("");

  const [municipalityQuery, setMunicipalityQuery] = useState("");
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(null);

  const [spots, setSpots] = useState<Spot[]>([]);
  const [loadingSpots, setLoadingSpots] = useState(false);
  const [groups, setGroups] = useState<CityGroup[]>([]);
  const [activeCityId, setActiveCityId] = useState<string | null>(null);

  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  // Map/Isoline セクションは削除

  // Geolocation helper
  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus("このブラウザは位置情報に対応していません");
      return;
    }
    const run = async () => {
      try {
        const perms = (navigator as any).permissions?.query
          ? await (navigator as any).permissions.query({ name: 'geolocation' as any })
          : null;
        if (perms && perms.state === 'denied') {
          setGeoStatus("位置情報がブラウザでブロックされています。URLバー横のサイト情報から許可に変更してください。");
          return;
        }
      } catch (_) {
        // Permissions API が使えない環境はそのまま進める
      }

      // ブラウザ組み込みの権限ポップアップをトリガー
      setGeoStatus("現在地を取得中...");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          setOrigin({ lat: latitude, lng: longitude });
          setGeoStatus(null);
          try {
            const res = await fetch(`/api/geocode?lat=${latitude}&lng=${longitude}`);
            const data = await res.json();
            if (data && data.address) setOriginAddress(data.address);
          } catch {}
        },
        (err) => {
          const message =
            err.code === err.PERMISSION_DENIED
              ? "位置情報の許可が得られませんでした"
              : err.code === err.POSITION_UNAVAILABLE
              ? "位置情報を取得できませんでした"
              : err.code === err.TIMEOUT
              ? "位置情報の取得がタイムアウトしました"
              : "位置情報の取得に失敗しました";
          setGeoStatus(message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    };
    run();
  }, []);

  // Fetch municipality suggestions (debounced by simple delay)
  useEffect(() => {
    const q = municipalityQuery.trim();
    if (!q) {
      setMunicipalities([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}`);
        let data: any = {};
        try {
          data = await res.json();
        } catch (_) {
          data = {};
        }
        const list = Array.isArray(data.municipalities) ? data.municipalities : [];
        setMunicipalities(list);
      } catch (_) {
        setMunicipalities([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [municipalityQuery]);

  const canSearch = useMemo(() => !!origin, [origin]);

  // Isoline 連動は削除

  const searchSpots = useCallback(async (overrideValue?: number) => {
    setLoadingSpots(true);
    setSelectedSpot(null);
    setDetails(null);
    const params = new URLSearchParams();
    if (selectedMunicipality?.name) params.set('municipality', selectedMunicipality.name);
    params.set('mode', mode);
    params.set('value', String((overrideValue ?? value) || 0));
    if (origin) params.set("origin", `${origin.lat},${origin.lng}`);
    try {
      const res = await fetch(`/api/places/search?${params.toString()}`);
      let data: any = {};
      try { data = await res.json(); } catch { data = {}; }
      const maybeGroups: CityGroup[] = Array.isArray(data.groups) ? data.groups : [];
      // 現在、右ペイン（地図/到達圏）は削除済み。グループ結果はボタン選択式で表示。
      setGroups(maybeGroups);
      setActiveCityId(null);
      setSpots(Array.isArray(data.spots) ? data.spots : []);
    } finally {
      setLoadingSpots(false);
    }
  }, [selectedMunicipality, mode, value, origin]);

  const selectSpot = useCallback(async (spot: Spot) => {
    setSelectedSpot(spot);
    setDetails(null);
    try {
      const res = await fetch(`/api/places/details?id=${encodeURIComponent(spot.id)}`);
      let data: any = null;
      try { data = await res.json(); } catch { data = null; }
      setDetails(data);
    } catch (_) {
      setDetails(null);
    }
  }, []);

  return (
    <div className="min-h-screen px-6 py-10 flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">北海道ドライブ観光ルートおすすめ</h1>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-4 p-4 rounded border border-black/10 dark:border-white/15">
          <h2 className="font-medium">条件</h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" name="mode" checked={mode === "time"} onChange={() => setMode("time")} />
              時間 (分)
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" name="mode" checked={mode === "distance"} onChange={() => setMode("distance")} />
              距離 (km)
            </label>
          </div>
          {mode === 'time' && (
            <div className="flex gap-2 text-sm">
              {[30,60,120].map(v => (
                <button key={v} className={`px-3 py-1 rounded border ${value===v?'bg-black text-white dark:bg-white dark:text-black':''}`} onClick={()=>{setValue(v); setValueText(String(v));}}> {v}分 </button>
              ))}
            </div>
          )}
          {mode === 'distance' && (
            <div className="flex gap-2 text-sm">
              {[20,50,150].map(v => (
                <button key={v} className={`px-3 py-1 rounded border ${value===v?'bg-black text-white dark:bg-white dark:text-black':''}`} onClick={()=>{setValue(v); setValueText(String(v));}}> {v}km </button>
              ))}
            </div>
          )}
          <input
            type="text"
            className="w-full border rounded px-3 py-2 text-sm bg-white/90 dark:bg-black/20"
            value={valueText}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={mode === 'time' ? '分を入力 (例: 30)' : 'kmを入力 (例: 50)'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                // 半角化 + 非数値除去
                const normalized = (valueText || '')
                  .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
                  .replace(/[^0-9.\-]/g, '');
                const n = Number(normalized);
                if (!Number.isFinite(n)) return;
                const clamped = Math.max(1, Math.min(n, mode === 'time' ? 300 : 500));
                setValue(clamped);
                setValueText(String(clamped));
                searchSpots(clamped);
              }
            }}
            onChange={(e) => {
              const raw = e.target.value;
              // 全角->半角、数字と小数点/符号のみ許可（途中入力は許容）
              const normalized = raw.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
              const interim = normalized.replace(/[^0-9.\-]/g, '');
              setValueText(interim);
            }}
            onBlur={() => {
              const normalized = (valueText || '')
                .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
                .replace(/[^0-9.\-]/g, '');
              const n = Number(normalized);
              if (!Number.isFinite(n)) {
                setValueText(String(value));
                return;
              }
              const clamped = Math.max(1, Math.min(n, mode === 'time' ? 300 : 500));
              setValue(clamped);
              setValueText(String(clamped));
            }}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">出発地（住所）</label>
              <button className="text-xs underline" onClick={useCurrentLocation}>現在地を使用</button>
            </div>
            <div className="flex gap-2">
              <input
                placeholder="現在地の住所がここに表示されます"
                className="flex-1 border rounded px-3 py-2 text-sm bg-white/90 dark:bg-black/20"
                value={originAddress}
                readOnly
              />
            </div>
            {geoStatus && <div className="text-xs text-red-600 dark:text-red-400">{geoStatus}</div>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">市区町村を検索</label>
            <input
              placeholder="例: 札幌市, 小樽市, 旭川市 ..."
              className="w-full border rounded px-3 py-2 text-sm bg-white/90 dark:bg-black/20"
              value={municipalityQuery}
              onChange={(e) => {
                setMunicipalityQuery(e.target.value);
                setSelectedMunicipality(null);
              }}
            />
            {municipalityQuery && municipalities.length > 0 && (
              <div className="max-h-48 overflow-auto border rounded text-sm divide-y">
                {municipalities.map((m) => (
                  <button
                    key={m.id}
                    className={`w-full text-left px-3 py-2 hover:bg-black/5 ${selectedMunicipality?.id === m.id ? 'bg-black/10' : ''}`}
                    onClick={() => setSelectedMunicipality(m)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            disabled={!canSearch}
            onClick={() => searchSpots()}
            className="mt-2 w-full h-10 rounded bg-black text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            おすすめを表示
          </button>
        </div>

        <div className="md:col-span-2 space-y-4">
          <h2 className="font-medium">検索結果</h2>
          {loadingSpots && <div className="text-sm">読み込み中...</div>}
          {!loadingSpots && groups.length === 0 && spots.length === 0 && (
            <div className="text-sm opacity-70">検索結果はまだありません。</div>
          )}
          {!loadingSpots && groups.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <button
                    key={g.city.id}
                    className={`px-3 py-1 rounded border text-sm ${activeCityId===g.city.id?'bg-black text-white dark:bg-white dark:text-black':''}`}
                    onClick={() => setActiveCityId(g.city.id)}
                  >
                    {g.city.name}
                  </button>
                ))}
              </div>
              {!activeCityId && (
                <div className="text-sm opacity-70">市を選択するとスポットが表示されます。</div>
              )}
              {activeCityId && (
                (() => {
                  const g = groups.find(x => x.city.id === activeCityId);
                  if (!g) return null;
                  return (
                    <div className="space-y-3">
                      <div className="text-lg font-medium">{g.city.name}</div>
                      {g.spots.length === 0 && (
                        <div className="text-sm opacity-70">周辺スポットが見つかりませんでした。</div>
                      )}
                      {g.spots.length > 0 && (
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {g.spots.map((s) => (
                            <li key={s.id} className="border rounded p-3 space-y-2">
                              <div className="font-medium">{s.name}</div>
                              <div className="text-xs text-gray-600 dark:text-gray-300">評価: {s.rating ?? '-'}（{s.reviews ?? 0}件）</div>
                              <div className="flex gap-2">
                                <a
                                  className="text-xs underline"
                                  href={
                                    (s.lat && s.lng)
                                      ? `https://www.google.com/maps/dir/?api=1&${origin ? `origin=${origin.lat},${origin.lng}&` : ''}destination=${encodeURIComponent(`${s.lat},${s.lng}`)}&travelmode=driving`
                                      : (s.mapsUrl || '#')
                                  }
                                  target="_blank"
                                  rel="noreferrer noopener"
                                >
                                  Google マップで開く
                                </a>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })()
              )}
            </div>
          )}
          {!loadingSpots && groups.length === 0 && spots.length > 0 && (
            <div className="space-y-3">
              <div className="text-lg font-medium">{selectedMunicipality?.name || 'スポット'}</div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {spots.map((s) => (
                  <li key={s.id} className="border rounded p-3 space-y-2">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">評価: {s.rating ?? '-'}（{s.reviews ?? 0}件）</div>
                    <div className="flex gap-2">
                      <a
                        className="text-xs underline"
                        href={
                          (s.lat && s.lng)
                            ? `https://www.google.com/maps/dir/?api=1&${origin ? `origin=${origin.lat},${origin.lng}&` : ''}destination=${encodeURIComponent(`${s.lat},${s.lng}`)}&travelmode=driving`
                            : (s.mapsUrl || '#')
                        }
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        Google マップで開く
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
