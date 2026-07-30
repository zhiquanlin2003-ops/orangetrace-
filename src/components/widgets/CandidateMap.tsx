"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Map as MapIcon, MapPin, AlertTriangle, Loader2, Lock } from "lucide-react";
import type { CandidateLocation } from "@/lib/types";
import { wgs84ToGcj02 } from "@/lib/coord-transform";

interface Props {
  candidates?: CandidateLocation[] | null;
}

/**
 * 候选地点地图: Leaflet + OSM 瓦片 (可缩放交互).
 *
 * 设计: 两层渲染
 *   1. 顶部 = 可缩放交互地图 (Leaflet, OSM 免费/无 Key/全球可用)
 *   2. (留作调试) 底部 = 高德静态地图 (Web Key) 做参考快照
 *
 * 候选 system:
 *   - 候选 marker 颜色随 final_confidence:
 *       >=70 红橙 (#f97316) / 30-69 橙黄 (#fb923c) / <30 灰 (#9ca3af)
 *   - 编号 marker (rank), 点击切换 active, 弹出详情 Popup
 */
export function CandidateMap({ candidates }: Props) {
  const [activeRank, setActiveRank] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);  // L.Map 实例
  const markersRef = useRef<any[]>([]); // 多个图层
  const mapInitRef = useRef<boolean>(false);

  const validCandidates = (candidates || []).filter(
    (c) => typeof c.latitude === "number" && typeof c.longitude === "number",
  );
  const activeCandidate = validCandidates.find((c) => c.rank === activeRank) ?? validCandidates[0];

  // 一次合并的 effect: 数据进入时初始化地图 + 画 marker; 数据变化时重画 marker
  useEffect(() => {
    if (!containerRef.current || validCandidates.length === 0) return;
    let cancelled = false;
    let map = mapRef.current;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      // 首次创建 map (若未创建)
      if (!map) {
        // 初始中心 = active 候选 (先转 GCJ-02, 跟高德瓦片投影一致)
        let [initLng, initLat] = activeCandidate
          ? [activeCandidate!.longitude!, activeCandidate!.latitude!]
          : [116, 30];
        if (activeCandidate && activeCandidate.coordinate_system !== "gcj02") {
          [initLng, initLat] = wgs84ToGcj02(activeCandidate!.longitude!, activeCandidate!.latitude!);
        }

        map = L.map(containerRef.current, {
          center: [initLat, initLng],
          zoom: 8,
          scrollWheelZoom: true,
          zoomControl: true,
          attributionControl: false,
        });

        // 高德瓦片层 (XYZ scheme, 不是 TMS)
        L.tileLayer(
          "https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}",
          {
            subdomains: ["1", "2", "3", "4"],
            maxZoom: 18,
            minZoom: 1,
            tileSize: 256,
          },
        ).addTo(map);

        mapRef.current = map;
        mapInitRef.current = true;

        // invalidateSize: 防止 layout 期间容器 size 错导致瓦片只显示半张
        setTimeout(() => { try { map!.invalidateSize({ animate: false }); } catch {} }, 100);
        setTimeout(() => { try { map!.invalidateSize({ animate: false }); } catch {} }, 500);
      }

      // 清掉旧 marker
      for (const m of markersRef.current) {
        try { map.removeLayer(m); } catch {}
      }
      markersRef.current = [];

      // 画所有候选 marker
      const bbox: [number, number][] = [];
      for (const c of validCandidates) {
        const color = colorForConfidence(c.final_confidence ?? c.initial_confidence ?? 0);
        const isActive = c.rank === activeCandidate?.rank;
        const size = isActive ? 40 : 30;

        let [lng, lat] = [c.longitude!, c.latitude!];
        if (c.coordinate_system !== "gcj02") {
          [lng, lat] = wgs84ToGcj02(c.longitude!, c.latitude!);
        }

        const html = `
          <div style="
            position: relative;
            display:flex;flex-direction:column;align-items:center;
            transform: translate(-50%, -100%);
          ">
            <div style="
              width: ${size}px;height: ${size}px;border-radius:50% 50% 50% 0;
              background: ${color};
              border: ${isActive ? 3 : 2}px solid white;
              box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              display:flex;align-items:center;justify-content:center;
              color: white;font-weight: 700;font-size: ${isActive ? 16 : 13}px;
              transform: rotate(-45deg);
            ">
              <span style="transform: rotate(45deg);">${c.rank}</span>
            </div>
          </div>
        `;

        const icon = L.divIcon({
          className: "orangetrace-marker",
          html,
          iconSize: [size, size],
          iconAnchor: [size / 2, size],
          popupAnchor: [0, -size],
        });

        const marker = L.marker([lat, lng], { icon }).addTo(map);
        marker.bindPopup(popupContent(c));
        if (isActive) marker.openPopup();
        markersRef.current.push(marker);
        bbox.push([lat, lng]);
      }

      // 自适应范围
      if (bbox.length === 1) {
        map.setView(bbox[0], 10);
      } else if (bbox.length > 1) {
        try {
          map.fitBounds(L.latLngBounds(bbox).pad(0.3), { maxZoom: 12 });
        } catch {}
      }
    })();

    return () => {
      cancelled = true;
      // 不要在依赖变化时清空 map, 否则会无限重建
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRank, JSON.stringify(validCandidates.map((c) => [c.id, c.latitude, c.longitude]))]);

  // 真正 unmount 时才销毁 map
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
        mapInitRef.current = false;
      }
    };
  }, []);

  // 状态 1: 候选为空 → 占位卡
  const noCoordCount = candidates ? candidates.length - validCandidates.length : 0;
  if (!candidates || candidates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapIcon className="h-4 w-4 text-orange-500" /> 候选地点地图
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-zinc-500">
          本次分析暂无候选地点。
        </CardContent>
      </Card>
    );
  }

  if (validCandidates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapIcon className="h-4 w-4 text-orange-500" /> 候选地点地图
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
            本次分析的候选都没有精确坐标,无法渲染地图。
          </div>
          {noCoordCount > 0 && (
            <ul className="mt-3 space-y-1.5">
              {candidates!.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-zinc-100">
                  <span className="flex items-center gap-1.5 text-zinc-700">
                    <MapPin className="h-3.5 w-3.5 text-orange-500" />
                    候选 {c.rank}: {c.name || "?"}
                  </span>
                  <span className="text-zinc-400">坐标暂缺</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-orange-500" /> 候选地点地图
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* 可缩放 Leaflet 地图 */}
        <div className="relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
          <div ref={containerRef} className="w-full" style={{ height: 380 }} />
          {/* 图例 */}
          <div className="absolute right-2 top-2 rounded-md bg-white/95 px-2 py-1.5 text-[10px] leading-tight shadow ring-1 ring-zinc-200">
            <div className="font-semibold text-zinc-600">置信度图例</div>
            <div className="mt-0.5 flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#f97316" }} /><span className="text-zinc-600">≥ 70 高</span></div>
            <div className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#fb923c" }} /><span className="text-zinc-600">30–69 中</span></div>
            <div className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#9ca3af" }} /><span className="text-zinc-600">&lt; 30 低</span></div>
          </div>
        </div>

        {/* 操作提示 */}
        <p className="text-[11px] leading-relaxed text-zinc-400">
          鼠标滚轮缩放地图,点击 marker 看候选详情。我方使用 OpenStreetMap 瓦片,国内候选为 GCJ-02 坐标系,实际放点会有轻微偏移,请同时参考下方坐标值。
        </p>

        {/* 候选列表, 点击切换地图焦点 */}
        <div className="rounded-xl bg-zinc-50/60 p-2">
          <p className="mb-1.5 px-2 text-[11px] text-zinc-500">点击候选让地图居中并弹出该候选详情 →</p>
          <ul className="space-y-1.5">
            {validCandidates.map((c) => (
              <li
                key={c.id}
                onClick={() => {
                  setActiveRank(c.rank);
                  // setView 也需要 GCJ-02 坐标
                  let [vLng, vLat] = [c.longitude!, c.latitude!];
                  if (c.coordinate_system !== "gcj02") {
                    [vLng, vLat] = wgs84ToGcj02(c.longitude!, c.latitude!);
                  }
                  mapRef.current?.setView([vLat, vLng], 11);
                }}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ring-1 transition-colors ${
                  c.rank === activeCandidate?.rank
                    ? "bg-orange-50 ring-orange-300"
                    : "bg-white ring-zinc-100 hover:ring-orange-200"
                }`}
              >
                <span className="flex items-center gap-1.5 text-zinc-700">
                  <MapPin className="h-3.5 w-3.5 text-orange-500" />
                  <span className="font-medium">候选 {c.rank}:</span>
                  {[c.country, c.province, c.city, c.district, c.name]
                    .filter(Boolean)
                    .filter((x) => x && x.trim())
                    .join(" · ") || "?"}
                  <span className="ml-1 font-mono text-zinc-400">
                    ({c.latitude!.toFixed(3)}, {c.longitude!.toFixed(3)})
                  </span>
                </span>
                <Badge tone="orange">置信度 {c.final_confidence ?? c.initial_confidence ?? 0}</Badge>
              </li>
            ))}
          </ul>
        </div>

        {/* 无坐标候选 */}
        {noCoordCount > 0 && (
          <div className="border-t border-zinc-100 pt-2">
            <p className="px-2 text-[11px] text-zinc-400">无坐标且本次仍考虑的候选:</p>
            <ul className="mt-1 space-y-1">
              {candidates!
                .filter((c) => !(typeof c.latitude === "number" && typeof c.longitude === "number"))
                .map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-1.5 text-[11px] text-zinc-500"
                  >
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-zinc-400" />
                      候选 {c.rank}: {c.name || "?"}
                    </span>
                    <span className="text-zinc-400">坐标暂缺</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 候选 marker 颜色 = 置信度分级 */
function colorForConfidence(c: number): string {
  if (c >= 70) return "#f97316"; // 橙
  if (c >= 30) return "#fb923c"; // 橙黄
  return "#9ca3af"; // 灰
}

/** 候选 Popup HTML */
function popupContent(c: CandidateLocation): string {
  const place = [c.country, c.province, c.city, c.district, c.name].filter(Boolean).join(" / ");
  const coords =
    typeof c.latitude === "number" && typeof c.longitude === "number"
      ? `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`
      : "未知";
  return `
    <div style="font-size:12px;line-height:1.5;max-width:240px;color:#18181b;">
      <strong style="font-size:13px;color:#9a3412;">候选 ${c.rank} · ${c.name || "?"}</strong><br/>
      <span style="color:#71717a;">${place || "—"}</span><br/>
      <span style="color:#71717a;font-family:monospace;">${coords}</span><br/>
      <span style="color:#f97316;font-weight:600;">最终置信度 ${c.final_confidence ?? c.initial_confidence ?? 0}</span>
    </div>
  `;
}
