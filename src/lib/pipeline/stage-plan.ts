import type { CandidateLocation } from "@/lib/types";
import type { ToolPlanItem } from "./types";
import type { ToolInput } from "@/lib/tools/types";

/**
 * 根据初始候选 + 模型线索, 生成工具调用计划。
 *
 * 调度规则:
 *  - EXIF: 全局只跑一次, 不绑定候选
 *  - 高德 POI / geocode / nearby_search / overpass: 每个有意义的候选 (≥ initial_confidence 阈值) 各一组
 *  - SunCalc: 仅在已有"拍摄时间 + 候选坐标"时为每个候选生成
 *  - 国内候选 (国家含 "中" 或 country=China): 优先 amap; 否则 overpass/suncalc
 *  - 系统 ENABLE_* 配置已通过各 Tool.isEnabled() 过滤 (run.ts 内)
 *
 * 每个候选上限 5 次工具调用 (run.ts 强制).
 */
export function buildPlan(
  candidates: CandidateLocation[],
  initialResult: any,
  options: { capturedAt?: string; knownRegion?: string; additionalContext?: string; visualQueries?: string[] },
): ToolPlanItem[] {
  const plan: ToolPlanItem[] = [];
  // EXIF: 全局, 不绑候选
  plan.push({
    tool: "exif",
    candidateId: "_global_",
    input: {
      capturedAt: options.capturedAt,
      userContext: options.additionalContext,
    },
  });

  // 视觉提取出的疑似 POI 字符串 (来自初始推理的 clues.text / verification_suggestions / 候选 name)
  let visualQueries: string[] = options.visualQueries && options.visualQueries.length
    ? options.visualQueries
    : extractVisualPois(initialResult, candidates);

  // 候选筛选: 初始 confidence ≥ 15 的候选 (排除几乎被否定的)
  const ranked = candidates.filter((c) => (c.initial_confidence ?? 0) >= 0).slice(0, 4);

  for (const c of ranked) {
    const isChina = isChinaLocation(c);
    const lat = typeof c.latitude === "number" ? c.latitude : undefined;
    const lng = typeof c.longitude === "number" ? c.longitude : undefined;
    const coords = lat != null && lng != null ? { latitude: lat, longitude: lng } : undefined;
    const region = c.city || c.province || options.knownRegion || "";
    // 这个候选自己最像 POI 的查询词: 永远优先候选自己 name 抽出的(精确到该候选地点),
    // 全局 visualQueries (clues.text / verification_suggestions) 仅在该候选 name 无法抽出可用 POI 时兜底
    let candidatePoiQueries = extractQueryFromName(c.name);
    if (candidatePoiQueries.length === 0 && visualQueries.length) {
      candidatePoiQueries = visualQueries;
    }

    if (isChina) {
      // 国内: POI 关键字搜 (若模型给了或候选有名)
      if (candidatePoiQueries.length) {
        // 一候选只发一个 POI 查询 (用第一个 query), run.ts 还会按限额控制
        plan.push({
          tool: "amap_poi_search",
          candidateId: c.id,
          input: {
            candidateId: c.id, candidateLabel: candidateLabel(c),
            query: candidatePoiQueries[0], region,
          },
        });
      }
      // 地理编码 (从未知坐标走向已知)
      if (!coords) {
        // 清掉括号/装饰性文字, 防止高德对组合地址报 ENGINE_RESPONSE_DATA_ERROR
        const cleanForGeocode = String(c.name || "")
          .replace(/[（(][^)）]*[)）]/g, "")
          .replace(/[\s,，·]+/g, " ")
          .trim();
        plan.push({
          tool: "amap_geocode",
          candidateId: c.id,
          input: {
            candidateId: c.id,
            candidateLabel: candidateLabel(c),
            query: cleanForGeocode || candidatePoiQueries[0] || c.name,
            region,
          },
        });
      } else {
        plan.push({
          tool: "amap_reverse_geocode",
          candidateId: c.id,
          input: {
            candidateId: c.id,
            candidateLabel: candidateLabel(c),
            coordinates: coords,
            radius: 800,
          },
        });
        plan.push({
          tool: "amap_nearby_search",
          candidateId: c.id,
          input: {
            candidateId: c.id,
            candidateLabel: candidateLabel(c),
            coordinates: coords,
            radius: 1000,
            featureTypes: ["amenity", "shop", "public_transport"],
          },
        });
      }
    } else {
      // 海外或未知国家: 主用 Overpass
      if (coords) {
        plan.push({
          tool: "overpass_nearby",
          candidateId: c.id,
          input: {
            candidateId: c.id,
            candidateLabel: candidateLabel(c),
            coordinates: coords,
            radius: 1000,
            featureTypes: ["road", "railway", "bridge", "waterway", "amenity", "shop"],
          },
        });
      }
    }

    // 光影验证: 候选有坐标且有拍摄时间
    if (coords && options.capturedAt) {
      plan.push({
        tool: "suncalc",
        candidateId: c.id,
        input: {
          candidateId: c.id,
          coordinates: coords,
          capturedAt: options.capturedAt,
        },
      });
    }
  }

  return plan;
}

function candidateLabel(c: CandidateLocation): string {
  return [c.country, c.province, c.city, c.district, c.name].filter(Boolean).filter((x) => x && x.trim()).join(" · ") || c.name || "未知候选";
}

/** 从候选 name 抽可搜索的 POI 词 (去掉国家/省前缀, 去括号, 留地名主体)。 */
function extractQueryFromName(name?: string): string[] {
  let s = String(name || "").trim();
  if (!s) return [];
  // 去括号 + 内容 (中括号/圆括号)
  s = s.replace(/[（(].*?[)）].*$/, "").trim();
  // 去常见前缀 "中国 / 北京 / 省"
  s = s.replace(/^(中国|中华人民共和国|蒙古|日本|韩国|美国|英国|法国|德国|俄罗斯|泰国|越南|马来西亚|新加坡|印度尼西亚|澳大利亚)/, "").trim();
  s = s.replace(/^(北京|上海|天津|重庆|香港|澳门|台湾)市?/, "").trim();
  s = s.replace(/^[^市]+市/, "").trim();
  // 太短或太长都不好
  if (s.length < 2 || s.length > 20) {
    // 回退用原名 (去括号后)
    const raw = String(name || "").replace(/[（(].*?[)）].*$/, "").trim();
    return raw && raw.length >= 2 && raw.length <= 20 ? [raw] : [];
  }
  return [s];
}

function isChinaLocation(c: CandidateLocation): boolean {
  const k = `${c.country ?? ""}`.trim();
  // 显式的中国标识
  if (k.includes("中") || k === "China" || k.toLowerCase() === "prc") return true;
  // name 里含中国字样
  const n = `${c.name ?? ""}`;
  if (n.includes("中国") || n.includes("中华")) return true;
  // 国内省份前缀 (省/市/区/县 一级词头, 与 overseas 国家词头互斥)
  if (/^(北京|上海|天津|重庆|香港|澳门|台湾|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|内蒙古|广西|宁夏|新疆|西藏)/.test(k)) {
    return true;
  }
  // 空 country → 默认中国 (国内定位场景为主)
  if (!k) return true;
  return false;
}

/** 从初始结果里抽可能能搜索的 POI 名 / 商铺名 / 文字线索。
 *  优先 clues.text 和 verification_suggestions; 若都没有, 退化到候选 name 的精简关键词。 */
function extractVisualPois(initial: any, candidates?: CandidateLocation[]): string[] {
  const out = new Set<string>();
  const push = (s: string) => {
    s = String(s || "").trim();
    // 去掉括号 + 内部 (例 "邵阳武冈机场 (WGN)" → "邵阳武冈机场")
    s = s.replace(/\s*[（(].*?[)）].*$/, "").trim();
    if (!s) return;
    if (s.length > 20 || s.length < 2) return;
    // 排除太通用的描述
    if (/公交线路|方向|大约|可能|似乎|疑似|传统|历史|片区|其他|未知/.test(s)) return;
    out.add(s);
  };
  const clues = initial?.clues;
  if (clues) {
    // clues.text 是图片中识别的文字, 可能就是 POI 关键词
    (clues.text || []).forEach(push);
  }
  if (Array.isArray(initial?.verification_suggestions)) {
    initial.verification_suggestions.forEach(push);
  }
  // 兜底: 用候选 name 抽关键词 (去掉城市/省前缀, 例如 "中国北京市 (传统胡同片区)" → "北京市")
  if (out.size === 0 && candidates && candidates.length) {
    for (const c of candidates.slice(0, 3)) {
      const nm = String(c.name || "").trim();
      if (!nm) continue;
      // 去括号 + 内容
      push(nm);
    }
  }
  return Array.from(out).slice(0, 3);
}
