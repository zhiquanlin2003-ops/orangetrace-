import { NextRequest } from "next/server";
import { GET as historyGet, POST as discussPost } from "@/app/api/discuss/[id]/route";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST /api/analysis/[id]/chat —— 与 /api/discuss/[id] 等价 (规范第十四节命名) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return discussPost(req, ctx);
}

/** GET /api/analysis/[id]/chat —— 历史 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return historyGet(req, ctx);
}
