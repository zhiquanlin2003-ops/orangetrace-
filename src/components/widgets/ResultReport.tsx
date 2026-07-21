import {
  Building2,
  Car,
  FileText,
  Lightbulb,
  MapPin,
  Mountain,
  ShieldAlert,
  Sparkles,
  Tag,
  Terminal,
  Wrench,
} from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, ConfidenceBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

const CLUE_META = [
  { key: "text", label: "文字线索", icon: FileText, tone: "orange" as const },
  { key: "architecture", label: "建筑线索", icon: Building2, tone: "blue" as const },
  { key: "infrastructure", label: "道路 / 交通线索", icon: Car, tone: "purple" as const },
  { key: "natural_geography", label: "自然地理线索", icon: Mountain, tone: "green" as const },
  { key: "light_shadow", label: "光影线索", icon: Lightbulb, tone: "yellow" as const },
  { key: "exif", label: "EXIF 线索", icon: Tag, tone: "zinc" as const },
  { key: "other", label: "其他可疑细节", icon: Sparkles, tone: "orange" as const },
];

export function ResultReport({ result }: { result: AnalysisResult }) {
  return (
    <div className="space-y-5">
      {/* 顶部结论卡 */}
      <Card className="overflow-hidden border-orange-200">
        <div className="bg-gradient-to-br from-orange-50 to-white p-5 sm:p-6">
          <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold uppercase tracking-wider">
            <MapPin className="h-3.5 w-3.5" /> 最可能地点
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            {composePlaceLabel(result.top_location) || "未能确定"}
          </h2>
          {result.summary && (
            <p className="mt-2 text-sm text-zinc-600 max-w-2xl">{result.summary}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ConfidenceBadge score={result.top_location.confidence} />
            {result.top_location.coordinates && (
              <Badge tone="zinc">
                <Terminal className="h-3 w-3" />
                {result.top_location.coordinates}
              </Badge>
            )}
            {!result.top_location.coordinates && (
              <Badge tone="zinc">经纬度: 不确定 (未编造)</Badge>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Field label="国家" value={result.top_location.country} />
            <Field label="城市" value={result.top_location.city} />
            <Field label="区域 / 街道" value={result.top_location.region || "不确定"} />
            <Field label="置信度" value={`${result.top_location.confidence ?? 0} / 100`} />
          </dl>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 候选地点 */}
        <Card>
          <CardHeader>
            <CardTitle>候选地点</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {result.candidates.length === 0 ? (
              <p className="text-sm text-zinc-400">模型未给出候选</p>
            ) : (
              <ol className="space-y-4">
                {result.candidates.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-zinc-200 p-4 bg-zinc-50/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-zinc-900 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700">
                          {i + 1}
                        </span>
                        {c.location || "未命名"}
                      </span>
                      <ConfidenceBadge score={c.confidence} />
                    </div>
                    <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-green-600 mb-1">
                          支持理由
                        </p>
                        {c.supporting_evidence.length ? (
                          <ul className="space-y-1">
                            {c.supporting_evidence.map((e, k) => (
                              <li key={k} className="text-zinc-600 flex gap-1.5">
                                <span className="text-green-500">+</span>
                                <span>{e}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-zinc-400">—</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-red-500 mb-1">
                          反对 / 不确定
                        </p>
                        {c.weakness.length ? (
                          <ul className="space-y-1">
                            {c.weakness.map((e, k) => (
                              <li key={k} className="text-zinc-600 flex gap-1.5">
                                <span className="text-red-400">−</span>
                                <span>{e}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-zinc-400">—</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* 线索拆解 */}
        <Card>
          <CardHeader>
            <CardTitle>线索拆解</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {CLUE_META.map((meta) => {
              const items = (result.clues as any)[meta.key] as string[];
              return (
                <div
                  key={meta.key}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    items.length
                      ? "border-zinc-200 bg-white"
                      : "border-dashed border-zinc-100 bg-zinc-50/40",
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge tone={meta.tone}>
                      <meta.icon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                    <span className="text-xs text-zinc-400">
                      {items.length ? `${items.length} 条` : "无"}
                    </span>
                  </div>
                  {items.length > 0 && (
                    <ul className="space-y-1 pl-1">
                      {items.map((it, k) => (
                        <li key={k} className="text-sm text-zinc-700 flex gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-400" />
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* 推理链路 */}
      <Card>
        <CardHeader>
          <CardTitle>推理链路</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {result.reasoning_steps.length === 0 ? (
            <p className="text-sm text-zinc-400">模型未输出推理步骤</p>
          ) : (
            <ol className="relative space-y-4 pl-6">
              <span className="absolute left-2 top-1.5 bottom-1.5 w-px bg-gradient-to-b from-orange-300 via-orange-200 to-transparent" />
              {result.reasoning_steps.map((step, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[1.15rem] top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-orange-500 ring-4 ring-orange-100" />
                  <p className="text-sm text-zinc-700 leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* 验证建议 + 工具 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-orange-500" /> 下一步人工验证
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {result.verification_suggestions.length === 0 ? (
              <p className="text-sm text-zinc-400">无</p>
            ) : (
              <ul className="space-y-2">
                {result.verification_suggestions.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-700">
                    <span className="mt-0.5 text-orange-500">→</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <ShieldAlert className="h-4 w-4" /> 结果提醒
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-amber-800 space-y-2">
            <p>{result.safety_note || "该结果是 AI 推理，不保证 100% 准确，需要人工通过地图、街景、公开资料再次验证。"}</p>
            <p>
              对居住地、学校、办公室等私人地点，请勿用于人肉搜索或跟踪。隐私详情见
              {" "}
              <a href="/privacy" className="underline font-medium">隐私与安全说明</a>。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-zinc-100">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-zinc-800 truncate">
        {value && value.trim() ? value : "—"}
      </dd>
    </div>
  );
}

function composePlaceLabel(loc: AnalysisResult["top_location"]): string {
  return [loc.country, loc.city, loc.region].filter(Boolean).filter((x) => x && x.trim() && x !== "不确定").join(" · ");
}
