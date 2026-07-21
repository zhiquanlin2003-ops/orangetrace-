"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Map as MapIcon, MapPin, AlertTriangle, Loader2, Lock } from "lucide-react";
import type { CandidateLocation } from "@/lib/types";

interface Props {
  candidates?: CandidateLocation[] | null;
}

export function CandidateMap({ candidates }: Props) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  // 优先 build-time 注入的 NEXT_PUBLIC_*; 否则在客户端 fetch DB 配置
  // (运营可以在后台 UI 即时更新 Key 而不用重新 build)
  const envJsKey = process.env.NEXT_PUBLIC_AMAP_JS_KEY;
  const envSecurityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;

  const [jsKey, setJsKey] = useState<string>(envJsKey ?? "");
  const [securityCode, setSecurityCode] = useState<string>(envSecurityCode ?? "");
  const [configLoaded, setConfigLoaded] = useState<boolean>(Boolean(envJsKey));

  useEffect(() => {
    if (envJsKey) return; // 已有 build-time Key 不必再请求
    let cancelled = false;
    fetch("/api/config/amap-js", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setJsKey(j.js_key || "");
        setSecurityCode(j.security_js_code || "");
        setConfigLoaded(true);
      })
      .catch(() => setConfigLoaded(true));
    return () => { cancelled = true; };
  }, [envJsKey]);

  const configured = Boolean(jsKey);

  useEffect(() => {
    if (!configured) return;
    // 已经加载过 → 等 AMap 全局可用就 ready
    if (window.AMap) {
      setReady(true);
      return;
    }
    // 设置安全密钥 (2.0 JS API 要求)
    if (securityCode) {
      window._AMapSecurityConfig = { securityJsCode: securityCode };
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-amap-loader="1"]',
    );
    if (existing) {
      existing.addEventListener("load", () => {
        // 等 AMap 全局真正挂在 window 上才算 ready
        if (window.AMap) setReady(true);
      });
      return;
    }
    const s = document.createElement("script");
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(jsKey!)}`;
    s.async = true;
    s.setAttribute("data-amap-loader", "1");
    s.onload = () => {
      // 高德 2.0 加载完成后, window.AMap 才挂上去
      if (window.AMap) {
        setReady(true);
      } else {
        setFailed("高德 JS API 已加载, 但未挂出 window.AMap, 可能 Key 无效或被限域名.");
      }
    };
    s.onerror = () => setFailed("高德地图 JS API 加载失败, 请稍后刷新页面或检查网络。");
    document.head.appendChild(s);
  }, [configured, jsKey, securityCode]);

  // 当 ready 且 container 存在 → 渲染标记
  useEffect(() => {
    const AMap = amapNS();
    if (!ready || !containerRef.current || !AMap) return;
    if (!candidates || candidates.length === 0) return;
    try {
      if (!mapRef.current) {
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 4,
          center: [116.39, 39.9], // 默认北京 (GCJ02)
          viewMode: "2D",
        });
      }
      const map = mapRef.current;
      map.clearMap();
      const pts: any[] = [];
      for (const c of candidates) {
        if (typeof c.latitude !== "number" || typeof c.longitude !== "number") continue;
        // 国内 (中国) → GCJ02, 直接用; 其他 → WGS84, 用官方转换 (失分容错: 失败时直接放点)
        const isChinaGCJ02 = c.coordinate_system === "gcj02";
        const lng = c.longitude;
        const lat = c.latitude;
        const marker = new AMap.Marker({
          position: [lng, lat],
          content: markerContent(c.rank, c.final_confidence ?? c.initial_confidence),
          offset: new AMap.Pixel(-16, -34),
          extData: c,
        });
        const info = new AMap.InfoWindow({
          content: infoContent(c),
          offset: new AMap.Pixel(0, -38),
        });
        marker.on("click", () => info.open(map, marker.getPosition()));
        map.add(marker);
        pts.push([lng, lat]);

        if (!isChinaGCJ02) {
          // 提示: 候选坐标系为 WGS84, 实际放点会有轻微偏移 (规范第十一节, 不混用坐标系)
          marker.setLabel({
            offset: new AMap.Pixel(0, 4),
            content: "WGS84",
            direction: "top",
          });
        }
      }
      if (pts.length > 0) {
        map.setFitView();
      }
    } catch (err) {
      setFailed((err as Error)?.message || "地图渲染失败");
    }
  }, [ready, candidates]);

  // 卸载时销毁 map
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch {}
        mapRef.current = null;
      }
    };
  }, []);

  // 占位卡 (Key 未配置) — 必须等 DB 配置加载完才断定"未配置"
  if (!configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapIcon className="h-4 w-4 text-orange-500" /> 候选地点地图
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!configLoaded ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" /> 正在读取地图配置…
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                <Lock className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium text-zinc-700">地图组件尚未配置</p>
                <p className="mt-1 text-xs text-zinc-500">
                  请在后台「验证工具配置」里填写「高德 JS API Key」, 或设置 NEXT_PUBLIC_AMAP_JS_KEY 环境变量。<br />
                  候选地点仍在下方列表中可见。
                </p>
              </div>
            </div>
          )}
          {candidates && candidates.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {candidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-zinc-100">
                  <span className="flex items-center gap-1.5 text-zinc-700">
                    <MapPin className="h-3.5 w-3.5 text-orange-500" />
                    候选 {c.rank}: {[c.country, c.province, c.city, c.district, c.name].filter(Boolean).filter((x) => x && x.trim()).join(" · ") || "?"}
                    {typeof c.latitude === "number" && typeof c.longitude === "number" && (
                      <span className="ml-1 font-mono text-zinc-400">
                        ({c.latitude.toFixed(3)}, {c.longitude.toFixed(3)} {c.coordinate_system})
                      </span>
                    )}
                  </span>
                  <Badge tone="orange">置信度 {c.final_confidence ?? c.initial_confidence ?? 0}</Badge>
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
      <CardContent className="pt-0">
        {failed && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{failed} 地图组件加载失败, 不影响上方报告展示。</span>
          </div>
        )}
        <div className="relative h-[360px] w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载地图中…
            </div>
          )}
          <div ref={containerRef} className="absolute inset-0" />
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">
          国内候选点按 GCJ-02 坐标系渲染; 海外候选点为 WGS-84, 标签已明确标注。点击标记可查看该候选的置信度与证据摘要。
        </p>
      </CardContent>
    </Card>
  );
}

function markerContent(rank: number, confidence?: number): string {
  return `<div style="width:32px;height:38px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;font-size:11px;font-weight:600;color:#9a3412;">
    <svg viewBox="0 0 24 24" width="32" height="32" fill="#f97316" stroke="#ffffff" stroke-width="1.5">
      <path d="M12 2C7 2 4 5.5 4 9c0 5 8 13 8 13s8-8 8-13c0-3.5-3-7-8-7z"/>
    </svg>
    <span style="margin-top:-22px;color:white;font-size:11px;">${rank}</span>
  </div>`;
}

function infoContent(c: CandidateLocation): string {
  const place = [c.country, c.province, c.city, c.district, c.name].filter(Boolean).join(" / ");
  const coords = typeof c.latitude === "number" && typeof c.longitude === "number"
    ? `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)} (${c.coordinate_system})`
    : "未知坐标";
  return `<div style="padding:8px 10px;font-size:12px;line-height:1.5;max-width:220px;color:#18181b;">
    <strong style="font-size:13px;color:#9a3412;">候选 ${c.rank} · ${c.name || c.city || "?"}</strong><br/>
    <span style="color:#71717a;">${place || "—"}</span><br/>
    <span style="color:#71717a;font-family:monospace;">${coords}</span><br/>
    <span style="color:#f97316;font-weight:600;">最终置信度 ${c.final_confidence ?? c.initial_confidence ?? 0}</span>
  </div>`;
}

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: any;
  }
}

// 统一从 window.AMap 取 (高德 2.0 JS API 的官方全局名)
function amapNS(): any {
  return (typeof window !== "undefined" ? window.AMap : undefined);
}
