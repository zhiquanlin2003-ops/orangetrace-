import { NextRequest, NextResponse } from "next/server";
import { POST as verifyPost } from "@/app/api/analysis/[id]/verify/route";

export const runtime = "nodejs";

/**
 * POST /api/analysis/[id]/verify-tool —— 单工具重新验证
 * Body: { tool, candidateId? }
 * 等价于传 onlyTool 的 verify 调用。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // 包装一层, 把 { tool, candidateId? } 改写为 verify 接受的 onlyTool/candidateId
  const raw = await req.json().catch(() => ({}));
  const body = {
    onlyTool: raw.tool,
    candidateId: raw.candidateId,
    skipSecondEval: raw.skipSecondEval ?? true,
  };
  const fakeReq = new NextRequest(req.url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return verifyPost(fakeReq, ctx);
}
