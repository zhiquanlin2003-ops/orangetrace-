import type {
  ToolInput,
  ToolResult,
  VerificationEvidence,
  VerificationTool,
} from "@/lib/tools/types";
import { decodeConfig } from "@/lib/tools/store";

/**
 * OSM Overpass 查询。
 * 限半径 ≤ 5000, 必带 [timeout:15], 返回结果数量在 templates.ts 控制。
 */
export function isOverpassEnabled(): boolean {
  if ((process.env.ENABLE_OVERPASS ?? "true") === "false") return false;
  return Boolean(decodeConfig("overpass"));
}

export function resolveOverpassConfig(): { endpoint: string; timeoutMs: number; defaultRadius: number; maxRadius: number } {
  const cfg = decodeConfig("overpass") || {};
  return {
    endpoint: cfg.endpoint || process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter",
    timeoutMs: Number(cfg.timeout_ms ?? 15000),
    defaultRadius: Number(cfg.default_radius_m ?? 1000),
    maxRadius: Number(cfg.max_radius_m ?? 5000),
  };
}

/** 特定要素类型的 Overpass QL 片段。 */
export function buildOverpassQuery(
  opts: { lat: number; lng: number; radius: number; featureTypes?: string[]; outLimit?: number },
): string {
  const radius = Math.min(Math.max(opts.radius, 100), 5000);
  const features = opts.featureTypes && opts.featureTypes.length ? opts.featureTypes : [
    "highway", "railway", "bridge", "waterway", "natural", "building",
  ];
  const limit = Math.min(Math.max(opts.outLimit ?? 40, 1), 200);
  const around = `(around:${radius},${opts.lat},${opts.lng})`;
  const parts: string[] = [];
  for (let f of features) {
    f = f.toLowerCase();
    if (f === "road" || f === "highway") parts.push(`way["highway"]${around}`);
    else if (f === "railway" || f === "rail") parts.push(`way["railway"]${around}`);
    else if (f === "station") {
      parts.push(`node["railway"="station"]${around}`);
      parts.push(`node["public_transport"="station"]${around}`);
    } else if (f === "bridge") parts.push(`way["bridge"]${around}`);
    else if (f === "tunnel") parts.push(`way["tunnel"]${around}`);
    else if (f === "waterway") parts.push(`way["waterway"]${around}`);
    else if (f === "water" || f === "natural=water") parts.push(`way["natural"="water"]${around}`);
    else if (f === "building") parts.push(`way["building"]${around}`);
    else if (f === "amenity") parts.push(`node["amenity"]${around}`);
    else if (f === "tourism") parts.push(`node["tourism"]${around}`);
    else if (f === "shop") parts.push(`node["shop"]${around}`);
    else if (f === "public_transport") parts.push(`node["public_transport"]${around}`);
    else parts.push(`node["${f}"]${around}`);
  }
  return `[out:json][timeout:25];(\n  ${parts.join(";\n  ")};\n);\nout body ${limit};`;
}

export class OverpassTool implements VerificationTool {
  readonly name = "overpass_nearby";
  readonly label = "OpenStreetMap / Overpass";

  isEnabled(): boolean {
    return isOverpassEnabled();
  }
  isConfigured(): boolean {
    return Boolean(resolveOverpassConfig().endpoint);
  }

  async execute(input: ToolInput): Promise<ToolResult> {
    const startedAt = new Date().toISOString();
    if (!this.isEnabled()) {
      return skip(this, startedAt, "Overpass 工具未启用 (后台或 ENABLE_OVERPASS=false)");
    }
    const coords = input.coordinates;
    if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
      return skip(this, startedAt, "候选无坐标, 无法 Overpass 查询");
    }
    const cfg = resolveOverpassConfig();
    const radius = Math.min(input.radius ?? cfg.defaultRadius, cfg.maxRadius);
    const query = buildOverpassQuery({
      lat: coords.latitude,
      lng: coords.longitude,
      radius,
      featureTypes: input.featureTypes,
      outLimit: 50,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const resp = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: controller.signal,
      });
      if (resp.status === 429) {
        return fail(this, startedAt, "Overpass 接口被限流 (429), 稍后再试");
      }
      if (!resp.ok) {
        return fail(this, startedAt, `Overpass HTTP ${resp.status}`);
      }
      const json = (await resp.json()) as any;
      const elements: any[] = json?.elements ?? [];
      if (elements.length === 0) {
        // 空结果不算失败 —— 候选地周边确实没有匹配要素也是一种「证据」。
        return {
          tool: this.name, label: this.label, status: "success",
          summary: `半径 ${radius}m 内未发现 ${input.featureTypes?.join("/") ?? "查询要素"} 类要素`,
          evidence: [{
            type: "neutral",
            title: "周边地理要素缺失",
            description: `候选点 ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)} 附近无 ${input.featureTypes?.join("/") ?? "指定要素"}。`,
            candidateId: input.candidateId,
            confidence: 30,
            source: "OpenStreetMap / Overpass",
            coordinates: coords,
          }],
          rawData: { count: 0 },
          startedAt, finishedAt: new Date().toISOString(),
        };
      }
      const summary = summarizeElements(elements);
      // 把每组类型抽 1 条作为代表证据
      const evidence: VerificationEvidence[] = summary.slice(0, 6).map((s) => ({
        type: "support",
        title: s.label,
        description: `OSM 命中 ${s.count} 个 (${s.tags || "无 name"}); 距离最近约 ${s.nearestMeters}m`,
        candidateId: input.candidateId,
        confidence: 45,
        source: "OpenStreetMap / Overpass",
        coordinates: coords,
      }));
      return {
        tool: this.name, label: this.label, status: "success",
        summary: `半径 ${radius}m 内发现 ${elements.length} 个 OSM 要素 (${summary.map((s) => `${s.label}×${s.count}`).slice(0, 6).join(", ")})`,
        evidence,
        rawData: {
          count: elements.length,
          breakdown: summary,
          sample: elements.slice(0, 10).map((e) => ({ id: e.id, type: e.type, tags: e.tags })),
        },
        startedAt, finishedAt: new Date().toISOString(),
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return fail(this, startedAt, `Overpass 请求超时 (${cfg.timeoutMs}ms)`);
      }
      return fail(this, startedAt, (err as Error)?.message ?? "Overpass 请求失败");
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const cfg = resolveOverpassConfig();
    try {
      const resp = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent('[out:json][timeout:5];node(1);out;'),
      });
      if (resp.ok) return { ok: true, message: `Overpass 可达 (${cfg.endpoint})` };
      return { ok: false, message: `HTTP ${resp.status}` };
    } catch (err) {
      return { ok: false, message: (err as Error)?.message ?? "请求失败" };
    }
  }
}

interface ElSummary { type: string; label: string; count: number; tags: string; nearestMeters: number }

function summarizeElements(elements: any[]): ElSummary[] {
  const byKey = new Map<string, ElSummary>();
  for (const e of elements) {
    const t = e.tags || {};
    let key = "other";
    let label = "其他";
    if (t.highway) { key = "highway"; label = `道路 (${t.highway})`; }
    else if (t.railway) { key = "railway"; label = `铁路 (${t.railway})`; }
    else if (t.waterway) { key = "waterway"; label = `水道 (${t.waterway})`; }
    else if (t.bridge) { key = "bridge"; label = `桥梁`; }
    else if (t.natural) { key = "natural"; label = `自然 (${t.natural})`; }
    else if (t.building) { key = "building"; label = `建筑 (${t.building === "yes" ? "—" : t.building})`; }
    else if (t.amenity) { key = "amenity"; label = `设施 (${t.amenity})`; }
    else if (t.shop) { key = "shop"; label = `商店 (${t.shop})`; }
    else if (t.tourism) { key = "tourism"; label = `旅游 (${t.tourism})`; }
    const ex = byKey.get(key);
    if (ex) {
      ex.count++;
      ex.tags = ex.tags || (t.name ?? "");
    } else {
      byKey.set(key, { type: key, label, count: 1, tags: t.name ?? "", nearestMeters: -1 });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => b.count - a.count);
}

function skip(t: VerificationTool, startedAt: string, reason: string): ToolResult {
  return {
    tool: t.name, label: t.label, status: "skipped",
    summary: reason, evidence: [], startedAt,
    finishedAt: new Date().toISOString(),
  };
}
function fail(t: VerificationTool, startedAt: string, reason: string): ToolResult {
  return {
    tool: t.name, label: t.label, status: "failed",
    summary: reason, evidence: [], error: reason,
    startedAt, finishedAt: new Date().toISOString(),
  };
}
