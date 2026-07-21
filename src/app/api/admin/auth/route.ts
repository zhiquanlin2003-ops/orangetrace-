import { NextRequest, NextResponse } from "next/server";
import { loginWithCredentials, logoutAdmin, requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { username, password } = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
  }
  const res = await loginWithCredentials(username, password);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await logoutAdmin();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const r = await requireAdmin();
  return NextResponse.json({ authenticated: r.ok });
}
