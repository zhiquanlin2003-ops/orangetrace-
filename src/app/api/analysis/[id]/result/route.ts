import { NextRequest } from "next/server";
import { GET as resultGet } from "@/app/api/result/[id]/route";

export const runtime = "nodejs";

/** GET /api/analysis/[id]/result —— /api/result/[id] 的正式路径别名 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return resultGet(req, ctx);
}
