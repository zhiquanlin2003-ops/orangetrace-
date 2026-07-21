import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// 重要: 此 middleware 在 Edge Runtime 中执行, 绝不能引入 better-sqlite3 / fs 等 Node 模块。
// 它只读 cookie 并校验 JWT 签名, 真正的鉴权由各 API route / 服务端组件完成。

const COOKIE_NAME = "ot_admin";
const ALG = "HS256";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || "orangetrace-dev-secret";
  return new TextEncoder().encode(s);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
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
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};

export { COOKIE_NAME };
