import { NextResponse } from "next/server";
import { decodeConfig } from "@/lib/tools/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 把 DB 中已配置的高德 JS Key 暴露给前端 (供结果页地图渲染)。
 *
 * 安全说明: NEXT_PUBLIC_AMAP_JS_KEY 本来就是「客户端公开」的 Key 类型,
 *   高德后台限定 Referer 白名单来防滥用, 这是高德自己 2.0 JS API 的设计。
 * 这个接口等价于 Next.js 在 build time 注入 NEXT_PUBLIC_* 的功能,
 *   但允许运营通过后台 UI 在不重启的情况下即时更新 Key。
 *
 * 优先级: NEXT_PUBLIC_AMAP_JS_KEY 环境 > DB verification_tool_configs.amap_js.js_key
 */
export async function GET() {
  const envJsKey = process.env.NEXT_PUBLIC_AMAP_JS_KEY;
  const envSecurityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;

  const db = decodeConfig("amap_js");
  const dbJsKey = (db?.js_key as string) || "";
  const dbSecurityCode = (db?.security_js_code as string) || "";

  const jsKey = envJsKey && envJsKey.trim() ? envJsKey.trim() : dbJsKey;
  const securityCode = envSecurityCode && envSecurityCode.trim() ? envSecurityCode.trim() : dbSecurityCode;

  return NextResponse.json(
    {
      js_key: jsKey || "",
      security_js_code: securityCode || "",
      configured: Boolean(jsKey),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
