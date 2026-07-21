import { SignJWT, jwtVerify } from "jose";
import {cookies} from "next/headers";
import { createHash } from "crypto";
import { getDb } from "./db";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "ot_admin";
const ALG = "HS256";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || "orangetrace-dev-secret";
  return new TextEncoder().encode(s);
}

export function hashPassword(p: string): string {
  return "sha256:" + createHash("sha256").update(p).digest("hex");
}

export async function signAdminToken(username: string): Promise<string> {
  return new SignJWT({ sub: username, role: "admin" })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

async function verifyToken(token: string): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return { sub: String(payload.sub) };
  } catch {
    return null;
  }
}

/** 校验用户名/密码, 成功则下发 7 天 cookie。 */
export async function loginWithCredentials(
  username: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM admin_users WHERE username = ?")
    .get(username) as { username: string; password_hash: string } | undefined;
  if (!row) return { ok: false, error: "用户名或密码错误" };
  if (row.password_hash !== hashPassword(password)) {
    return { ok: false, error: "用户名或密码错误" };
  }
  const token = await signAdminToken(username);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return { ok: true };
}

export async function logoutAdmin() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** 在服务端组件 / route handler 中校验当前是否为管理员。 */
export async function requireAdmin(): Promise<{ ok: true; user: string } | { ok: false }> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return { ok: false };
  const payload = await verifyToken(token);
  if (!payload) return { ok: false };
  return { ok: true, user: payload.sub };
}

/** middleware 用: 从任意请求头取 cookie 校验。 */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const payload = await verifyToken(token);
  return !!payload;
}

export { COOKIE_NAME };
