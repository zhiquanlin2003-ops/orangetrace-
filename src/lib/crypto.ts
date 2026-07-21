import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || "0".repeat(64);
  // 用固定 salt 派生 32 字节密钥
  return scryptSync(secret.padEnd(64, "0").slice(0, 64), "orangetrace-salt-v1", 32);
}

/**
 * 加密明文字符串. 返回 `enc:v1:<iv>:<tag>:<ct>` 形式的字符串, 可安全存库.
 * 失败时(例如空值)原样返回.
 */
export function encrypt(plain: string): string {
  if (!plain) return "";
  try {
    const key = getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, key, iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
  } catch {
    return plain; // 解密失败兜底, 不阻断流程
  }
}

/** 解密 `enc:v1:...` 形式的字符串. 若不是加密格式则原样返回. */
export function decrypt(payload: string): string {
  if (!payload) return "";
  if (!payload.startsWith("enc:v1:")) return payload;
  try {
    const [, , ivHex, tagHex, ctHex] = payload.split(":");
    const key = getKey();
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const out = Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]);
    return out.toString("utf8");
  } catch {
    return "";
  }
}

/** 只返回 key 的掩码, 用于管理后台展示, 例如 `sk-··abcd` */
export function maskKey(payload: string): string {
  const plain = decrypt(payload);
  if (!plain) return "—";
  if (plain.length <= 8) return "••••";
  return plain.slice(0, 3) + "••••" + plain.slice(-4);
}
