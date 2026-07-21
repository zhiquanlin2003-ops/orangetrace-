import { NextResponse } from "next/server";
import { getEnabledTools } from "@/lib/data";

export const runtime = "nodejs";

/** 前台结果页推荐验证工具 (无需鉴权)。 */
export async function GET() {
  return NextResponse.json({ items: getEnabledTools() });
}
