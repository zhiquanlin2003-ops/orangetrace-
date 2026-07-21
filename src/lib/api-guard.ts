import { NextResponse } from "next/server";
import { requireAdmin } from "./auth";

/** 在 API route 顶部调用, 未登录则返回 401 response。 */
export async function adminGuard() {
  const r = await requireAdmin();
  if (!r.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "未登录或会话失效" }, { status: 401 }),
    };
  }
  return { ok: true as const, user: r.user };
}
