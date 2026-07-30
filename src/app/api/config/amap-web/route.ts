import { NextResponse } from "next/server";
import { decodeConfig } from "@/lib/tools/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 把已配置的高德 Web 服务 Key 返回前端 (供结果页静态地图 URL 用).
 *
 * 这个 Key 本来就在所有 server-side 高德调用 URL 里, 也用在 amap_poi_search/
 * geocode 等工具的 GET query param 中. 给前端做静态地图 URL 是等价行为, 无新增暴露面.
 *
 * 优先级: AMAP_WEB_SERVICE_KEY 环境 > DB verification_tool_configs.amap_web.key_enc
 */
export async function GET() {
  const envKey = process.env.AMAP_WEB_SERVICE_KEY;
  const db = decodeConfig("amap_web");
  const dbKey = (db?.key_enc as string) || "";

  const key = envKey && envKey.trim() ? envKey.trim() : dbKey;
  return NextResponse.json(
    {
      key: key || "",
      configured: Boolean(key),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
