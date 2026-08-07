import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** POST /api/unlock — 验证邀请密钥, 通过后设 Cookie 放行 */
export async function POST(req: NextRequest) {
  const { code } = await req.json().catch(() => ({}));

  // 密钥: 优先从环境变量读, 缺省 Aminer
  const inviteCode = process.env.INVITE_CODE || "Aminer";

  if (!code || code.trim() !== inviteCode.trim()) {
    return NextResponse.json({ error: "邀请密钥不正确" }, { status: 403 });
  }

  // 设 Cookie, 30 天有效
  const res = NextResponse.json({ ok: true });
  res.cookies.set("ot_unlocked", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 天
  });
  return res;
}
