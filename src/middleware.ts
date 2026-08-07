import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// 重要: 此 middleware 在 Edge Runtime 中执行, 绝不能引入 better-sqlite3 / fs 等 Node 模块。
// 它只读 cookie 并校验, 真正的鉴权由各 API route / 服务端组件完成。

const COOKIE_NAME = "ot_admin";
const UNLOCK_COOKIE = "ot_unlocked";
const ALG = "HS256";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || "orangetrace-dev-secret";
  return new TextEncoder().encode(s);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ───── 1. Admin 鉴权 (原有逻辑, 不变) ─────
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    let ok = false;
    if (token) {
      try {
        await jwtVerify(token, secret(), { algorithms: [ALG] });
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ───── 2. 邀请密钥: 放行 unlock 页本身 / 静态资源 / API ─────
  if (
    pathname.startsWith("/unlock") ||
    pathname.startsWith("/api/unlock") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/uploads") ||
    pathname.startsWith("/api/uploads") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ───── 3. 检查邀请密钥 Cookie ─────
  const unlocked = req.cookies.get(UNLOCK_COOKIE)?.value;
  if (unlocked === "1") {
    return NextResponse.next();
  }

  // 未解锁 → 跳转解锁页
  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export { COOKIE_NAME, UNLOCK_COOKIE };
