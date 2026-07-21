import type { Skill } from "./types";

/** 从一段 HTML 文本中提取纯文本。 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ParsedSkillDoc {
  title: string;
  sections: Array<{
    heading: string;
    level: number;
    body: string;
    bullets: string[];
  }>;
  text: string;
}

interface HeadingHit {
  level: number;
  heading: string;
  start: number; // 标签开始位置
  end: number; // 标签结束位置
}

/** 收集所有 h1-h4 标题位置。 */
function collectHeadings(html: string): HeadingHit[] {
  const re = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const out: HeadingHit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({
      level: Number(m[1]),
      heading: stripHtml(m[2]).trim(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

/** 把 HTML 拆成标题段落结构。 */
export function parseHtmlDoc(html: string): ParsedSkillDoc {
  const titleMatch =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? stripHtml(titleMatch[1]).trim() : "未命名文档";

  const headings = collectHeadings(html);
  const sections: ParsedSkillDoc["sections"] = [];

  // 第一个标题之前的内容作为引言
  if (headings.length > 0) {
    const intro = html.slice(0, headings[0].start);
    if (stripHtml(intro).trim()) {
      sections.push({
        heading: title,
        level: 1,
        body: stripHtml(intro).trim(),
        bullets: extractBullets(stripHtml(intro)),
      });
    }
  } else {
    const text = stripHtml(html);
    if (text) {
      sections.push({ heading: title, level: 1, body: text, bullets: extractBullets(text) });
    }
  }

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const next = headings[i + 1];
    const slice = next ? html.slice(h.end, next.start) : html.slice(h.end);
    const body = stripHtml(slice).trim();
    sections.push({
      heading: h.heading,
      level: h.level,
      body,
      bullets: extractBullets(body),
    });
  }

  return { title, sections, text: stripHtml(html) };
}

function extractBullets(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^([-*•·]|\d+[.)、])\s+/.test(l))
    .map((l) => l.replace(/^([-*•·]|\d+[.)、])\s+/, "").trim())
    .filter(Boolean);
}

export function parseMarkdownDoc(md: string): ParsedSkillDoc {
  const lines = md.split(/\r?\n/);
  const title =
    (lines.find((l) => /^#\s+/.test(l)) || "").replace(/^#\s+/, "").trim() ||
    "未命名文档";
  const sections: ParsedSkillDoc["sections"] = [];
  let cur: ParsedSkillDoc["sections"][number] | null = null;

  for (const line of lines) {
    const hm = line.match(/^(#{1,4})\s+(.*)$/);
    if (hm) {
      if (cur) sections.push(cur);
      cur = { heading: hm[2].trim(), level: hm[1].length, body: "", bullets: [] };
    } else if (cur) {
      const bm = line.match(/^\s*([-*]|\d+[.)])\s+(.*)$/);
      if (bm) cur.bullets.push(bm[2].trim());
      else if (line.trim()) cur.body += (cur.body ? "\n" : "") + line.trim();
    }
  }
  if (cur) sections.push(cur);
  return { title, sections, text: md };
}

/**
 * 把解析过的文档拆成多条结构化 Skill 条目。
 * 每个二级 / 三级标题视作一个方法。
 */
export function docToSkills(
  doc: ParsedSkillDoc,
  sourceName: string,
  defaultCategory: string,
): Omit<Skill, "id" | "created_at" | "updated_at">[] {
  const out: Omit<Skill, "id" | "created_at" | "updated_at">[] = [];

  const meaningful = doc.sections.filter((s) => s.body || s.bullets.length);

  if (meaningful.length === 0) {
    out.push(baseSkill(doc.title || sourceName, doc.text, sourceName, defaultCategory));
    return out;
  }

  for (const s of meaningful.slice(0, 60)) {
    out.push(
      baseSkill(s.heading || doc.title, s.body.slice(0, 600), sourceName, guessCategory(s.heading, defaultCategory), {
        key_clues: matchKeywords(s, ["关键", "线索", "特征", "标志", "关键字"]),
        recommended_tools: matchKeywords(s, ["工具", "推荐", "tool"]),
        caveats: matchKeywords(s, ["注意", "提醒", "风险", "局限", "caveat", "警告"]),
        scenario: matchFirstLine(s, ["场景", "适用", "用于", "应用"]),
        raw_content: `${s.heading}\n\n${s.body}\n\n${s.bullets.join("\n")}`,
      }),
    );
  }
  return out;
}

function baseSkill(
  name: string,
  description: string,
  source: string,
  category: string,
  extra?: Partial<Pick<Skill, "key_clues" | "recommended_tools" | "caveats" | "scenario" | "raw_content" | "priority">>,
): Omit<Skill, "id" | "created_at" | "updated_at"> {
  return {
    name: name || "未命名方法",
    description: description || "",
    scenario: extra?.scenario ?? "",
    key_clues: extra?.key_clues ?? "",
    recommended_tools: extra?.recommended_tools ?? "",
    caveats: extra?.caveats ?? "",
    category,
    priority: extra?.priority ?? 60,
    enabled: 1,
    version: "v1",
    source,
    raw_content: extra?.raw_content,
  };
}

function matchKeywords(section: { body: string; bullets: string[] }, keys: string[]): string {
  const all = (section.body + "\n" + section.bullets.join("\n"))
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const matched = all.filter((l) => keys.some((k) => l.toLowerCase().includes(k.toLowerCase())));
  const result = matched.length ? matched : section.bullets;
  return result
    .map((l) => l.replace(/^.*?(关键线索|关键|线索|推荐工具|工具|推荐|关键字|注意|提醒|风险|局限|caveat|警告)[:：]?\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .join("\n");
}

function matchFirstLine(section: { body: string; bullets: string[] }, keys: string[]): string {
  const all = (section.body + "\n" + section.bullets.join("\n"))
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const l of all) {
    if (keys.some((k) => l.toLowerCase().includes(k.toLowerCase()))) {
      return l.replace(/^.*?(场景|适用|应用|用于)[:：]?\s*/i, "").trim();
    }
  }
  return section.body.split("\n")[0]?.slice(0, 120) ?? "";
}

function guessCategory(name: string, fallback: string): string {
  if (!name) return fallback;
  const map: Array<[string, string]> = [
    ["exif", "EXIF"],
    ["元数据", "EXIF"],
    ["车牌", "基础设施"],
    ["道路", "基础设施"],
    ["路灯", "基础设施"],
    ["电线", "基础设施"],
    ["建筑", "建筑线索"],
    ["招牌", "文字线索"],
    ["文字", "文字线索"],
    ["ocr", "文字线索"],
    ["光影", "光影线索"],
    ["太阳", "光影线索"],
    ["阴影", "光影线索"],
    ["植被", "自然地理"],
    ["地形", "自然地理"],
    ["水体", "自然地理"],
    ["气候", "自然地理"],
    ["反搜", "反搜"],
    ["隐私", "安全"],
    ["安全", "安全"],
    ["poi", "地图与POI"],
    ["地图", "地图与POI"],
  ];
  const lower = name.toLowerCase();
  for (const [k, v] of map) {
    if (lower.includes(k)) return v;
  }
  return fallback;
}
