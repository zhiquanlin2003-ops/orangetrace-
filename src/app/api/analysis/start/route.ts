import { NextRequest, NextResponse } from "next/server";
import { POST as analyzePost } from "@/app/api/analyze/route";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST /api/analysis/start —— /api/analyze 的正式路径别名 (规范第十四节命名)。 */
export async function POST(req: NextRequest) {
  return analyzePost(req);
}
