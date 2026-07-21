import type { VerificationTool } from "@/lib/tools/types";
import { AmapTool } from "@/lib/tools/amap/tool";
import { OverpassTool } from "@/lib/tools/overpass/tool";
import { SuncalcTool } from "@/lib/tools/suncalc/tool";
import { ExifTool } from "@/lib/tools/exif/tool";
import {
  resolveAmapConfig,
  resolveAmapJsConfig,
  amapGet,
  isAmapEnabled,
} from "@/lib/tools/amap/client";

/** 全局单例。所有工具按 name 取用。 */
const TOOLS_BY_NAME = new Map<string, VerificationTool>();

/** 工具 mapping: 全部可调用的子能力。 */
export const ALL_TOOLS: VerificationTool[] = [
  new ExifTool(),
  new AmapTool("poi_search"),
  new AmapTool("geocode"),
  new AmapTool("reverse_geocode"),
  new AmapTool("nearby_search"),
  new OverpassTool(),
  new SuncalcTool(),
];

/** 测试专用的占位工具 (不参与 ALL_TOOLS, 不暴露在重新验证面板, 仅供测试发现)。 */
class TestAmapWeb implements VerificationTool {
  name = "amap_web";
  label = "高德地图 Web 服务 (测试)";
  async testConnection() {
    const cfg = resolveAmapConfig();
    if (!cfg.configured) return { ok: false, message: "Key 未配置" };
    const result = await amapGet("/v3/place/text", { keywords: "北京", city: "beijing", offset: 1 }, cfg);
    if (result.ok) return { ok: true, message: `POI 搜索连通正常 (${(result.raw as any)?.pois?.length ?? 0} 条返回)` };
    return { ok: false, message: result.error ?? "高德 Web API 返回失败" };
  }
  isEnabled() { return isAmapEnabled(); }
  isConfigured() { return resolveAmapConfig().configured; }
  async execute() { return { status: "skipped" } as any; }
}
class TestAmapJs implements VerificationTool {
  name = "amap_js";
  label = "高德地图 JS API (测试)";
  async testConnection() {
    const cfg = resolveAmapJsConfig();
    if (!cfg.configured) return { ok: false, message: "JS Key 未配置 (NEXT_PUBLIC_AMAP_JS_KEY)" };
    return { ok: true, message: "JS Key 已配置, 用于结果页地图渲染" };
  }
  isEnabled() { return isAmapEnabled(); }
  isConfigured() { return resolveAmapConfig().configured; }
  async execute() { return { status: "skipped" } as any; }
}

const testTools: VerificationTool[] = [new TestAmapWeb(), new TestAmapJs()];
for (const t of ALL_TOOLS) {
  TOOLS_BY_NAME.set(t.name, t);
}
for (const t of testTools) {
  TOOLS_BY_NAME.set(t.name, t);
}

/** 按 name 取 (大小写不敏感)。 */
export function getTool(name: string): VerificationTool | undefined {
  return TOOLS_BY_NAME.get(name) ?? TOOLS_BY_NAME.get(name.toLowerCase());
}

/** 列出可用于「重新验证」面板的展示名 */
export function listToolLabels(): { name: string; label: string }[] {
  return ALL_TOOLS.map((t) => ({ name: t.name, label: t.label }));
}

/** 用于后台连通性测试 (按 name 取 + 调 testConnection) */
export async function testToolByName(name: string): Promise<{ ok: boolean; message: string }> {
  const t = getTool(name);
  if (!t) return { ok: false, message: `未知工具: ${name}` };
  if (typeof t.testConnection === "function") {
    try {
      return await t.testConnection();
    } catch (err) {
      return { ok: false, message: (err as Error)?.message ?? "测试异常" };
    }
  }
  // 没有 testConnection 的工具 (EXIF / SunCalc) 直接判 enabled + configured
  const ok = t.isEnabled() && t.isConfigured();
  return { ok, message: ok ? `${t.label} 已就绪` : `${t.label} 未启用或缺少配置` };
}
