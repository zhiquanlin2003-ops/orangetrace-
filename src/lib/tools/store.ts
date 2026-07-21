import { getDb } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { safeJsonParse } from "@/lib/utils";
import type { VerificationToolConfig } from "@/lib/types";

/**
 * verification_tool_configs 表的 CRUD.
 *
 * 安全约定:
 *  - DB 中保存的 Key 字段一律为 AES-256-GCM 加密格式 (enc:v1:...)
 *  - 这里对外返回的 config.ObjectMapper 永远不会带回明文 key
 *  - 给工具执行用的明文 key 通过 decryptConfig 一次性解出, 且仅在内存中
 */

export interface ToolConfigDoc {
  k: string;
  label: string;
  tool_type: string;
  enabled: boolean;
  sort_order: number;
  last_test_at: string | null;
  last_test_status: string | null;
  /** 各工具自定义字段。安全字段 (key, key_enc, js_key, security_js_code, ...) 永不出现在 has_key/masked 之外 */
  cfg: Record<string, any>;
  has_key: boolean;
  masked_key: string;
  /**
   * 每个敏感字段是否已配置 (只有 true/false, 永不回明文)。
   * 例: { key_enc: true, js_key: false, security_js_code: true }
   * 供后台 / 仪表盘分字段展示配置状态。
   */
  key_flags: Record<string, boolean>;
}

/** 把 db row 的 config_json 解出来, 并把敏感字段归一化为 has_key + masked_key。 */
export function toDoc(row: VerificationToolConfig): ToolConfigDoc {
  const cfg = safeJsonParse<Record<string, any>>(row.config_json, {});

  // 该工具敏感字段名约定 (允许 config 里用以下任一名字)
  const keyFields = ["key_enc", "key", "js_key", "security_js_code", "token"];
  let hasKey = false;
  let plainKey = "";
  const keyFlags: Record<string, boolean> = {};
  for (const f of keyFields) {
    const v = cfg[f];
    if (typeof v === "string" && v.length > 0) {
      const plain = v.startsWith("enc:v1:") ? decrypt(v) : v;
      keyFlags[f] = !!plain;
      if (plain) {
        hasKey = true;
        // 取最后一个非空作为掩码来源
        if (f === "key_enc" || f === "key" || f === "js_key" || f === "token") {
          plainKey = plain;
        }
      }
    }
  }
  const masked = plainKey
    ? plainKey.length <= 6
      ? "••••"
      : plainKey.slice(0, 2) + "••••" + plainKey.slice(-4)
    : "—";

  // 保留 cfg 用于后台展示非敏感字段 (description / timeout / radius 等),
  // 但剔除敏感字段的明文/密文表示。
  const safeCfg: Record<string, any> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (keyFields.includes(k)) continue;
    safeCfg[k] = v;
  }

  return {
    k: row.k,
    label: row.label,
    tool_type: row.tool_type,
    enabled: row.enabled === 1,
    sort_order: row.sort_order,
    last_test_at: row.last_test_at ?? null,
    last_test_status: row.last_test_status ?? null,
    cfg: safeCfg,
    has_key: hasKey,
    masked_key: masked,
    key_flags: keyFlags,
  };
}

export function getAllToolConfigs(): ToolConfigDoc[] {
  return getDb()
    .prepare("SELECT * FROM verification_tool_configs ORDER BY sort_order, k")
    .all()
    .map((r: any) => toDoc(r as VerificationToolConfig));
}

export function getToolConfigRow(k: string): VerificationToolConfig | null {
  const row = getDb()
    .prepare("SELECT * FROM verification_tool_configs WHERE k = ?")
    .get(k) as VerificationToolConfig | undefined;
  return row ?? null;
}

export function getEnabledToolConfigs(): VerificationToolConfig[] {
  return getDb()
    .prepare("SELECT * FROM verification_tool_configs WHERE enabled = 1 ORDER BY sort_order, k")
    .all() as VerificationToolConfig[];
}

/** 读取某个工具的 config (已解密敏感字段, 仅在工具执行时使用)。 */
export function decodeConfig(k: string): Record<string, any> | null {
  const row = getToolConfigRow(k);
  if (!row) return null;
  if (row.enabled !== 1) return null;
  const cfg = safeJsonParse<Record<string, any>>(row.config_json, {});
  const dec: Record<string, any> = { ...cfg };
  const keyFields = ["key_enc", "key", "js_key", "security_js_code", "token"];
  for (const f of keyFields) {
    const v = dec[f];
    if (typeof v === "string" && v.length > 0) {
      // enc:v1:... 解密; 否则原样 (可能是明文)
      dec[f] = v.startsWith("enc:v1:") ? decrypt(v) : v;
    }
  }
  return dec;
}

export interface UpdateInput {
  enabled?: boolean;
  cfg_patch?: Record<string, any>;
  /** 明文 key 设置 (空串表示不修改); 仅当设 true 才清空 */
  set_key_fields?: Record<string, string>;
  clear_key_fields?: string[];
  label?: string;
  label_or_default?: string;
  sort_order?: number;
}

/**
 * 部分更新某工具配置。
 *  - cfg_patch 普通字段合并写入
 *  - set_key_fields 字段写为加密形式
 *  - clear_key_fields 字段写为空
 */
export function updateToolConfig(k: string, input: UpdateInput): boolean {
  const row = getToolConfigRow(k);
  if (!row) return false;
  const cfg = safeJsonParse<Record<string, any>>(row.config_json, {});

  if (input.cfg_patch) {
    for (const [kk, vv] of Object.entries(input.cfg_patch)) {
      // 安全: 不允许 cfg_patch 直接写敏感字段
      if (["key_enc", "key", "js_key", "security_js_code", "token"].includes(kk)) continue;
      cfg[kk] = vv;
    }
  }
  if (input.set_key_fields) {
    for (const [kk, vv] of Object.entries(input.set_key_fields)) {
      if (typeof vv === "string" && vv.length > 0) {
        cfg[kk] = encrypt(vv);
      }
    }
  }
  if (input.clear_key_fields) {
    for (const kk of input.clear_key_fields) {
      cfg[kk] = "";
    }
  }

  const updates: string[] = ["config_json = ?", "updated_at = datetime('now')"];
  const args: any[] = [JSON.stringify(cfg)];
  if (input.enabled !== undefined) {
    updates.push("enabled = ?");
    args.push(input.enabled ? 1 : 0);
  }
  if (input.label !== undefined) {
    updates.push("label = ?");
    args.push(input.label);
  }
  if (input.sort_order !== undefined) {
    updates.push("sort_order = ?");
    args.push(input.sort_order);
  }
  args.push(k);
  getDb()
    .prepare(`UPDATE verification_tool_configs SET ${updates.join(", ")} WHERE k = ?`)
    .run(...args);
  return true;
}

export function setTestResult(k: string, status: "ok" | "fail" | "skipped") {
  getDb()
    .prepare(
      `UPDATE verification_tool_configs
       SET last_test_at = datetime('now'), last_test_status = ?, updated_at = datetime('now')
       WHERE k = ?`,
    )
    .run(status, k);
}

/**
 * 读取 .env 与 DB 配置合并后的运行时明文 Key。
 * env 优先 (如果有 AMAP_WEB_SERVICE_KEY 等环境变量, 直接采用),
 * 否则回退 DB 加密配置。
 */
export function resolveSecret(envName: string, dbConfigKey: string, dbConfig?: Record<string, any> | null): string {
  const fromEnv = process.env[envName];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  if (dbConfig) {
    const v = dbConfig[dbConfigKey];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
