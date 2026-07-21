import type {
  ToolInput,
  ToolResult,
  VerificationEvidence,
  VerificationTool,
} from "@/lib/tools/types";
import {
  resolveAmapConfig,
  amapGet,
  isAmapEnabled,
} from "./client";

/**
 * 高德地图 Web 服务 - 单一工具, 内部根据 input 选取 4 个子能力之一:
 *   - poi_search: 关键词搜 POI (验证图片中识别出来的店名/地名是否真存在)
 *   - geocode:    把地名变经纬度
 *   - reverse_geocode: 把经纬度变省市区街道
 *   - nearby_search:    已知坐标后查周边设施
 *
 * 由 stage-plan.ts 通过 input.query / input.coordinates / input.region 控制,
 * 单个 ToolResult 包含若干 VerificationEvidence。
 */
export class AmapTool implements VerificationTool {
  name = "amap_poi_search";
  label = "高德地图 POI / 地址";

  private op: "poi_search" | "geocode" | "reverse_geocode" | "nearby_search";

  constructor(op: "poi_search" | "geocode" | "reverse_geocode" | "nearby_search" = "poi_search") {
    this.op = op;
    this.name = `amap_${op}`;
    if (op === "poi_search") this.label = "高德地图 POI 搜索";
    else if (op === "geocode") this.label = "高德地图 地理编码";
    else if (op === "reverse_geocode") this.label = "高德地图 逆地理编码";
    else this.label = "高德地图 周边搜索";
  }

  isEnabled(): boolean {
    return isAmapEnabled();
  }
  isConfigured(): boolean {
    return resolveAmapConfig().configured;
  }

  async execute(input: ToolInput): Promise<ToolResult> {
    const startedAt = new Date().toISOString();
    const config = resolveAmapConfig();
    if (!this.isEnabled()) {
      return skip(this, startedAt, "高德地图工具未启用 (管理后台或 ENABLE_AMAP_POI=false)");
    }
    if (!config.configured) {
      return skip(this, startedAt, "高德 Web 服务 Key 未配置, 请在后台填写或设置 AMAP_WEB_SERVICE_KEY");
    }
    try {
      switch (this.op) {
        case "poi_search":
          return await this.poiSearch(input, config, startedAt);
        case "geocode":
          return await this.geocode(input, config, startedAt);
        case "reverse_geocode":
          return await this.reverseGeocode(input, config, startedAt);
        case "nearby_search":
          return await this.nearbySearch(input, config, startedAt);
      }
    } catch (err) {
      return {
        tool: this.name,
        label: this.label,
        status: "failed",
        summary: `高德调用异常: ${(err as Error)?.message ?? "未知错误"}`,
        evidence: [],
        error: (err as Error)?.message,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }
  }

  private async poiSearch(input: ToolInput, config: ReturnType<typeof resolveAmapConfig>, startedAt: string): Promise<ToolResult> {
    const keywords = input.query?.trim();
    if (!keywords) {
      return skip(this, startedAt, "无 POI 关键字可搜 (模型未识别出商铺/POI 名称)");
    }
    // citylimit: 已知城市则只在市内搜
    const city = input.region || input.candidateLabel || "";
    const resp = await amapGet<any>("/v3/place/text", {
      keywords,
      city,
      citylimit: city ? "true" : "false",
      offset: 10,
      page: 1,
      output: "json",
      extensions: "base",
    }, config);

    if (!resp.ok) {
      return fail(this, startedAt, `POI 搜索失败: ${resp.error}`, resp.raw);
    }
    const pois: any[] = resp.data?.pois ?? [];
    return success(this, startedAt, {
      summary: `关键字「${keywords}」${city ? `于「${city}」` : ""}共找到 ${pois.length} 个 POI`,
      evidence: pois.slice(0, 5).map<VerificationEvidence>((p) => ({
        type: "support",
        title: p.name ?? "未命名 POI",
        description:
          `地址: ${p.address ?? "—"}; 省市区: ${p.pname ?? "?"}/${p.cityname ?? "?"}/${p.adname ?? "?"};` +
          `类型: ${p.type ?? "—"}` +
          (p.tel ? `; 电话: ${p.tel}` : ""),
        candidateId: input.candidateId,
        confidence: 65,
        source: "高德地图 POI 搜索",
        coordinates: parseAmapLocation(p.location),
      })),
      rawData: { count: pois.length, sample: pois.slice(0, 5).map(stripPoi) },
    });
  }

  private async geocode(input: ToolInput, config: ReturnType<typeof resolveAmapConfig>, startedAt: string): Promise<ToolResult> {
    const rawAddr = (input.query?.trim() || input.candidateLabel || "");
    if (!rawAddr) return skip(this, startedAt, "无地址可地理编码");
    // 第一次: 原样查询
    let resp = await amapGet<any>("/v3/geocode/geo", {
      address: rawAddr,
      city: input.region || "",
    }, config);
    // 第二次: 高德报 ENGINE_RESPONSE_DATA_ERROR 通常因 address 含括号/装饰文字, 清掉重试
    if (!resp.ok && /ENGINE_RESPONSE|参数|INVALID|地址/gi.test(resp.error || resp.info || "")) {
      const cleaned = rawAddr
        .replace(/[（(][^)）]*[)）]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned && cleaned !== rawAddr) {
        resp = await amapGet<any>("/v3/geocode/geo", {
          address: cleaned,
          city: input.region || "",
        }, config);
      }
    }
    if (!resp.ok) return fail(this, startedAt, `地理编码失败: ${resp.error || resp.info}`, resp.raw);
    const geos: any[] = resp.data?.geocodes ?? [];
    return success(this, startedAt, {
      summary: `地址「${rawAddr}」解析出 ${geos.length} 条坐标` + (geos[0] ? `（${geos[0].formatted_address ?? ""}）` : ""),
      evidence: geos.slice(0, 3).map<VerificationEvidence>((g) => ({
        type: "support",
        title: `${g.level ?? "geocode"}: ${g.formatted_address ?? rawAddr}`,
        description: `省: ${g.province ?? "—"}; 市: ${g.city ?? "—"}; 区: ${g.district ?? "—"}`,
        candidateId: input.candidateId,
        confidence: 55,
        source: "高德地图 地理编码",
        coordinates: parseAmapLocation(g.location),
      })),
      rawData: { count: geos.length, sample: geos.slice(0, 3) },
    });
  }

  private async reverseGeocode(input: ToolInput, config: ReturnType<typeof resolveAmapConfig>, startedAt: string): Promise<ToolResult> {
    const loc = parseLatLngFromInput(input);
    if (!loc) return skip(this, startedAt, "候选无坐标, 无法逆地理编码");
    const resp = await amapGet<any>("/v3/geocode/regeo", {
      location: `${loc.longitude},${loc.latitude}`,
      extensions: "base",
      radius: input.radius ?? 1000,
    }, config);
    if (!resp.ok) return fail(this, startedAt, `逆地理编码失败: ${resp.error}`, resp.raw);
    const c = resp.data?.regeocodes?.[0] ?? resp.data?.regeocode;
    if (!c) return fail(this, startedAt, "逆地理编码返回空", resp.raw);
    const comp = c.addressComponent || {};
    const pois: any[] = c.pois ?? [];
    return success(this, startedAt, {
      summary: `(${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}) 反查: ${comp.province ?? ""}${comp.city ?? ""}${comp.district ?? ""} ${c.formatted_address ?? ""}`,
      evidence: [
        {
          type: "support",
          title: `逆地理: ${[comp.province, comp.city, comp.district].filter(Boolean).join("/") || (c.formatted_address ?? "—")}`,
          description: `街道: ${comp.township ?? "—"}; 道路: ${comp.street?.[0]?.name ?? "—"}`,
          candidateId: input.candidateId,
          confidence: 50,
          source: "高德地图 逆地理编码",
          coordinates: loc,
        },
        ...pois.slice(0, 3).map<VerificationEvidence>((p) => ({
          type: "support",
          title: `附近 POI: ${p.name ?? "—"}`,
          description: `${p.distance ?? "?"}m, 类型 ${p.type ?? "—"}`,
          candidateId: input.candidateId,
          confidence: 45,
          source: "高德地图 逆地理编码",
          coordinates: parseAmapLocation(p.location),
        })),
      ],
      rawData: { formatted: c.formatted_address, components: comp, poi_count: pois.length },
    });
  }

  private async nearbySearch(input: ToolInput, config: ReturnType<typeof resolveAmapConfig>, startedAt: string): Promise<ToolResult> {
    const loc = parseLatLngFromInput(input);
    if (!loc) return skip(this, startedAt, "候选无坐标, 无法周边搜索");
    const types = input.featureTypes && input.featureTypes.length
      ? mapFeatureTypesToAmapCodes(input.featureTypes)
      : "";
    const resp = await amapGet<any>("/v3/place/around", {
      location: `${loc.longitude},${loc.latitude}`,
      radius: input.radius ?? 1000,
      types,
      offset: 10,
      sortrule: "distance",
    }, config);
    if (!resp.ok) return fail(this, startedAt, `周边搜索失败: ${resp.error}`, resp.raw);
    const pois: any[] = resp.data?.pois ?? [];
    return success(this, startedAt, {
      summary: `半径 ${input.radius ?? 1000}m 内发现 ${pois.length} 个公开 POI` + (types ? `（按类型 ${input.featureTypes!.join("/")}）` : ""),
      evidence: pois.slice(0, 5).map<VerificationEvidence>((p) => ({
        type: "support",
        title: `${p.name ?? "POI"} (${p.type ?? "—"}, ${p.direction ?? ""} ${p.distance ?? "?"}m)`,
        description: `地址: ${p.address ?? "—"}`,
        candidateId: input.candidateId,
        confidence: 40,
        source: "高德地图 周边搜索",
        coordinates: parseAmapLocation(p.location),
      })),
      rawData: { count: pois.length, sample: pois.slice(0, 5).map(stripPoi) },
    });
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const config = resolveAmapConfig();
    if (!config.configured) return { ok: false, message: "Key 未配置" };
    const resp = await amapGet<any>("/v3/place/text", {
      keywords: "天安门",
      city: "北京",
      citylimit: "true",
      offset: 1,
    }, config);
    if (resp.ok) return { ok: true, message: `连通正常, 测试返回 ${(resp.data?.pois?.length ?? 0)} 条` };
    return { ok: false, message: resp.error ?? "未知错误" };
  }
}

/* ===== 辅助 ===== */

function parseAmapLocation(loc: any): { latitude: number; longitude: number } | undefined {
  if (!loc || typeof loc !== "string") return undefined;
  const [lng, lat] = loc.split(",").map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
  return { latitude: lat, longitude: lng };
}

function parseLatLngFromInput(input: ToolInput): { latitude: number; longitude: number } | undefined {
  if (!input.coordinates) return undefined;
  const { latitude, longitude } = input.coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return { latitude, longitude };
}

function stripPoi(p: any): any {
  // 仅保留展示字段, 去掉可能含电话等敏感字段; telephone 在结果页不渲染, 这里也不留
  return {
    name: p.name,
    type: p.type,
    pname: p.pname,
    cityname: p.cityname,
    adname: p.adname,
    address: p.address,
    location: p.location,
    distance: p.distance,
    direction: p.direction,
  };
}

/* OSM 要素名 → 高德 POI 类型码 (近似). 高德码很细, 这里给一组常用大类. */
function mapFeatureTypesToAmapCodes(features: string[]): string {
  const map: Record<string, string> = {
    road: "190000", // 道路附属
    highway: "190000",
    railway: "220000", // 火车站 / 铁路相关
    station: "220000",
    bridge: "190405", // 跨线桥/立交桥
    river: "180000", // 水系
    water: "180000",
    building: "120000", // 商务住宅/楼宇
    shop: "060000", // 购物
    amenity: "050000", // 餐饮住宿
    public_transport: "220400", // 公交
  };
  const set = new Set<string>();
  for (const f of features) {
    const v = map[f.toLowerCase()];
    if (v) set.add(v);
  }
  return Array.from(set).join("|");
}

function skip(t: VerificationTool, startedAt: string, reason: string): ToolResult {
  return {
    tool: t.name, label: t.label, status: "skipped",
    summary: reason, evidence: [], startedAt,
    finishedAt: new Date().toISOString(),
  };
}
function fail(t: VerificationTool, startedAt: string, reason: string, rawData?: unknown): ToolResult {
  return {
    tool: t.name, label: t.label, status: "failed",
    summary: reason, evidence: [], error: reason,
    startedAt, finishedAt: new Date().toISOString(), rawData,
  };
}
function success(t: VerificationTool, startedAt: string, r: {
  summary: string;
  evidence: VerificationEvidence[];
  rawData?: unknown;
}): ToolResult {
  return {
    tool: t.name, label: t.label, status: "success",
    summary: r.summary, evidence: r.evidence, rawData: r.rawData,
    startedAt, finishedAt: new Date().toISOString(),
  };
}
