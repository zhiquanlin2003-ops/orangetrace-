import { resolveSecret, decodeConfig } from "@/lib/tools/store";

/**
 * 高德 Web 服务客户端。
 * 优先读 env AMAP_WEB_SERVICE_KEY, 否则读 DB verification_tool_configs.amap_web.key_enc (已解密)。
 *
 * 不向日志输出 Key。失败时抛出 Error, 上层 catch 后归一化为 status=failed。
 */

export interface AmapConfigResolved {
  key: string;
  baseUrl: string;
  timeoutMs: number;
  configured: boolean;
}

export function resolveAmapConfig(): AmapConfigResolved {
  const dbCfg = decodeConfig("amap_web");
  const key = resolveSecret("AMAP_WEB_SERVICE_KEY", "key_enc", dbCfg);
  const baseUrl =
    (dbCfg?.base_url as string) || "https://restapi.amap.com";
  const timeoutMs = Number(dbCfg?.timeout_ms ?? 8000);
  return {
    key,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    timeoutMs,
    configured: Boolean(key),
  };
}

export function isAmapEnabled(): boolean {
  const cfg = decodeConfig("amap_web");
  // 全局开关 (env)
  if ((process.env.ENABLE_AMAP_POI ?? "true") === "false") return false;
  return Boolean(cfg);
}

/**
 * 解析 amap_js (结果页地图 JS Key) 配置。
 * 只读 DB，不读 env（因为它是 NEXT_PUBLIC_ 前缀，Webpack 会注入前端）。
 */
export function resolveAmapJsConfig(): { js_key: string; security_js_code: string; configured: boolean } {
  const dbCfg = decodeConfig("amap_js");
  const jsKey = dbCfg?.js_key ?? "";
  const securityJsCode = dbCfg?.security_js_code ?? "";
  return {
    js_key: jsKey,
    security_js_code: securityJsCode,
    configured: Boolean(jsKey),
  };
}

export interface AmapResp<T> {
  ok: boolean;
  status?: string;
  info?: string;
  data?: T;
  raw?: any;
  error?: string;
}

/**
 * 通用高德 v3/v5 GET。返回结构化结果, 不抛错 (网络/超时统一 ok=false)。
 * Key 只放 query param, 不进任何 console 日志。
 */
export async function amapGet<T = any>(
  endpoint: string, // 例如 /v3/place/text
  params: Record<string, string | number | undefined>,
  config: AmapConfigResolved,
): Promise<AmapResp<T>> {
  if (!config.configured) {
    return { ok: false, error: "高德 Web 服务 Key 未配置" };
  }
  const url = new URL(config.baseUrl + endpoint);
  url.searchParams.set("key", config.key);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  // 输出策略: 只记 endpoint + status, 不记 URL (含 key)。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const json = (await resp.json()) as any;
    // 高德约定: status === "1" 为成功
    if (json && json.status === "1") {
      return { ok: true, status: "1", data: json, raw: json };
    }
    return {
      ok: false,
      status: String(json?.status ?? ""),
      info: json?.info,
      error: json?.info || `高德返回非成功 status=${json?.status}`,
      raw: json,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: `请求超时 (${config.timeoutMs}ms)` };
    }
    return { ok: false, error: (err as Error)?.message ?? "请求失败" };
  } finally {
    clearTimeout(timer);
  }
}
