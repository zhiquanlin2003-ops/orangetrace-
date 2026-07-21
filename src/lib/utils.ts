import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind 类名合并工具 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 格式化时间为本地可读字符串 */
export function formatDateTime(iso: string | number | Date | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 相对时间 (例如 "3 分钟前") */
export function timeAgo(iso: string | number | Date | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const diff = Date.now() - d;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return formatDateTime(iso);
}

/** 把置信度数值 (0-100) 转为 高/中/低 标签 */
export function confidenceLabel(score: number | undefined | null) {
  if (score == null || Number.isNaN(score)) return { label: "未知", level: "unknown" as const };
  const s = Math.max(0, Math.min(100, score));
  if (s >= 70) return { label: "高", level: "high" as const };
  if (s >= 40) return { label: "中", level: "medium" as const };
  return { label: "低", level: "low" as const };
}

/** 简单 nanoid */
export function nanoid(size = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < size; i++) out += chars[bytes[i] % chars.length];
  return out;
}

/** 生成短的可读 id, 例如 `a1b2c3d4` */
export function shortId() {
  return nanoid(8);
}

/** 截断文本 */
export function truncate(s: string, n = 120) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** 安全的 JSON 解析, 失败返回 fallback */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  // 先裸 parse
  try {
    return JSON.parse(raw) as T;
  } catch {
    // 失败 → 尝试容错修复 (尾随逗号 / 注释 / 单引号 / 未加引号 key / 嵌入代码块)
  }
  const repaired = repairJson(raw);
  try {
    return JSON.parse(repaired) as T;
  } catch {
    return fallback;
  }
}

/**
 * 容错修复模型输出常见的 JSON 不规范:
 *  - 去除注释 (// 行内 + /* 块)
 *  - 单引号字符串 → 双引号
 *  - 尾随逗号 [1, 2,] / {a:1,}
 *  - 未加引号的 key {summary: "..."}
 *  - 去掉外层 markdown fence 残留
 *  - 尝试自动闭合缺失的右括号 / 右大括号
 *
 * 这只做"贪婪修复", 不保证完整正确; 最后由 parseAnalysisResult 的字段兜底再保护一层。
 */
export function repairJson(raw: string): string {
  let s = String(raw || "");

  // 1. 去代码块 ```json ... ``` 或 ``` ... ``` (取第一段)
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) {
    s = fence[1];
  } else if (/```/.test(s)) {
    // 没闭合的 fence
    const start = s.indexOf("```");
    if (start !== -1) {
      const after = s.slice(start + 3);
      const nl = after.indexOf("\n");
      if (nl !== -1) s = after.slice(nl + 1);
    }
  }

  // 2. 去行内注释 // ... (但不能误删字符串内的 //, 例如 URL)
  //    简化策略: 只在行首 / 逗号 / 空白 后的 // 才当注释删除。否则跳过。
  s = s.replace(/(^|[,\[\{}{\s])\/\/[^\n\r]*/g, "$1");

  // 3. 去块注释 /* ... */
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");

  // 4. 单引号 → 双引号 (只在 JSON 键值正则里改, 不动字符串内单引号)
  //    用一个状态机扫描, 避免误伤
  s = convertSingleQuotesSmartly(s);

  // 5. 去尾随逗号: 在 ] 或 } 之前出现的逗号 (允许中间空白)
  s = s.replace(/,(\s*[\]}])/g, "$1");

  // 6. 给未加引号的 key 加引号: {summary: ...} → {"summary": ...}
  //    匹配: 在 { 或 , 之后, 一个合法标识符, 然后紧挨着冒号 (可直接 / 后有空白)
  s = s.replace(/([\[{,])(\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*):/g,
    (_m, prefix: string, sp1: string, key: string, sp2: string) =>
      `${prefix}${sp1}"${key}"${sp2}:`);

  // 7. 尝试闭合缺失括号 (如果模型 token 截断)
  s = autoClose(s);

  return s.trim();
}

function convertSingleQuotesSmartly(jsonLike: string): string {
  // 仅替换"成对的、紧贴 : 或 , 或 [ 或 { 后开始, 紧贴 , 或 ] 或 } 或 : 前结束"的单引号对
  // 用 negative lookahead 的简单策略: 单引号后接非空白, 算字符串内容, 简化处理
  let out = "";
  let i = 0;
  const n = jsonLike.length;
  let inDqString = false; // 在双引号字符串内
  while (i < n) {
    const c = jsonLike[i];
    if (c === '"' && (i === 0 || jsonLike[i - 1] !== "\\")) {
      inDqString = !inDqString;
      out += c;
      i++;
      continue;
    }
    if (inDqString) {
      out += c;
      i++;
      continue;
    }
    if (c === "'") {
      // 扫到匹配的单引号
      let j = i + 1;
      let content = "";
      while (j < n && jsonLike[j] !== "'") {
        content += jsonLike[j];
        j++;
      }
      // 内容里的 " 转义
      out += '"' + content.replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 尝试自动闭合: 数 [{ (`"`, 的不闭合 (即 count > 0 时补足) */
function autoClose(s: string): string {
  // 只数括号深度, 字符串内的不算
  const stack: string[] = [];
  let inDq = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' && (i === 0 || s[i - 1] !== "\\")) {
      inDq = !inDq;
      i++;
      continue;
    }
    if (inDq) { i++; continue; }
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}") {
      if (stack[stack.length - 1] === "}") stack.pop();
    } else if (c === "]") {
      if (stack[stack.length - 1] === "]") stack.pop();
    }
    i++;
  }
  // 如果最后一个字符串没闭合, 加 "
  if (inDq) s += '"';
  return s + stack.reverse().join("");
}

/** 从 markdown/json 代码块里提取出 JSON 内容 */
export function extractJsonFromText(text: string): string | null {
  if (!text) return null;
  // ```json ... ``` (允许未闭合的 fence, 兜底到末尾)
  const fenceClosed = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/i);
  if (fenceClosed) return fenceClosed[1].trim();
  const fenceOpen = text.match(/```(?:json|JSON)?\s*([\s\S]*)$/i);
  if (fenceOpen) {
    // 找 ``` 起点, 如果剩下的内容像 JSON 就返回
    const inner = fenceOpen[1].trim();
    if (inner.startsWith("{") || inner.startsWith("[")) return inner;
  }
  // 找到第一个 { 到最后一个 } 之间的内容
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return text.slice(first, last + 1).trim();
  }
  // 或者 [ 到 ] (数组形式)
  const f2 = text.indexOf("[");
  const l2 = text.lastIndexOf("]");
  if (f2 !== -1 && l2 !== -1 && l2 > f2) {
    return text.slice(f2, l2 + 1).trim();
  }
  return null;
}
