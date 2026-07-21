"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, ConfidenceBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  CheckCircle2,
  XCircle,
  CircleSlash,
  RefreshCw,
  Loader2,
  ExternalLink,
  FileText,
  Map as MapIcon,
  Sun,
  Tag,
  ShieldCheck,
} from "lucide-react";
import type { CrossVerificationSummary, ToolResultSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface Props {
  analysisId: string;
  summary?: CrossVerificationSummary;
  toolResults?: ToolResultSummary[];
  /** 触发重验证后回调 (通常刷新 result 数据) */
  onChanged?: () => void;
}

const TOOL_ICON: Record<string, any> = {
  exif: Tag,
  amap_poi_search: MapIcon,
  amap_geocode: MapIcon,
  amap_reverse_geocode: MapIcon,
  amap_nearby_search: MapIcon,
  overpass_nearby: MapIcon,
  suncalc: Sun,
};

const STATUSMETA = {
  success: { label: "验证成功", color: "text-orange-700", icon: CheckCircle2, badge: "green" as const },
  failed: { label: "验证失败", color: "text-red-600", icon: XCircle, badge: "red" as const },
  skipped: { label: "已跳过", color: "text-zinc-500", icon: CircleSlash, badge: "zinc" as const },
};

export function CrossVerification({ analysisId, summary, toolResults = [], onChanged }: Props) {
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rerunTool = async (tool: string, candidateId?: string) => {
    setRunningTool(tool);
    setError(null);
    try {
      const r = await fetch(`/api/analysis/${analysisId}/verify-tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, candidateId }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setError(j?.error || `重验证失败 (${r.status})`);
        return;
      }
      // 给后台一点时间再拉新数据
      setTimeout(() => onChanged?.(), 1800);
    } finally {
      setRunningTool(null);
    }
  };

  const rerunAll = async () => {
    setRunningAll(true);
    setError(null);
    try {
      const r = await fetch(`/api/analysis/${analysisId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setError(j?.error || `重验证失败 (${r.status})`);
        return;
      }
      // 多工具并行执行, 留些时间
      setTimeout(() => onChanged?.(), 2500);
    } finally {
      setRunningAll(false);
    }
  };

  return (
    <Card className="border-orange-200">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-orange-500" /> 交叉验证结果
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={rerunAll}
            disabled={runningAll || runningTool !== null}
          >
            {runningAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {runningAll ? "正在重验证…" : "重新验证所有工具"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* 顶部摘要 */}
        {summary ? (
          <SummaryRow summary={summary} />
        ) : toolResults.length === 0 ? (
          <p className="text-sm text-zinc-400">本次分析未执行任何工具验证。</p>
        ) : null}

        {/* 各工具卡片 */}
        {toolResults.length === 0 ? (
          <div className="mt-4 grid gap-2 text-sm text-zinc-500 sm:grid-cols-2">
            <div className="rounded-xl border border-dashed border-zinc-200 p-4">
              <p className="font-medium text-zinc-700">所有工具均未执行</p>
              <p className="mt-1 text-xs">
                该任务尚未配置可用的验证工具, 或当时被全部跳过。可点击「重新验证所有工具」让系统再尝试一次。
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {toolResults.map((t, i) => (
              <ToolCard
                key={`${t.tool}-${i}`}
                t={t}
                running={runningTool === t.tool}
                onRerun={() => rerunTool(t.tool)}
              />
            ))}
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-zinc-400">
          上方为 AI 与公开数据工具的概率性判断, 不代表确定事实。每张卡片标注的数据来源均为真实工具执行的真实记录; 未执行的工具会被标注为「已跳过」, 不会伪装成已验证。
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ summary }: { summary: CrossVerificationSummary }) {
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-zinc-700">已执行 <b className="text-zinc-900">{summary.total_tools}</b> 个工具</span>
        <Stat label="成功" value={summary.success} tone="text-orange-700" />
        <Stat label="失败" value={summary.failed} tone="text-red-600" />
        <Stat label="跳过" value={summary.skipped} tone="text-zinc-500" />
        <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-orange-200">
          透明评分: <span className="text-zinc-400 line-through">{summary.initial_confidence}</span>
          <span className="text-orange-500">→</span>
          <ConfidenceBadge score={summary.final_confidence} />
          {summary.confidence_delta >= 0 ? (
            <span className="text-green-600">+{summary.confidence_delta}</span>
          ) : (
            <span className="text-red-500">{summary.confidence_delta}</span>
          )}
        </span>
      </div>
      {!summary.executed_any && (
        <p className="mt-2 text-xs text-zinc-500">本轮未执行真实工具调用 (Key 未配置或全部跳过), 报告主要依据视觉推理 + 透明评分维护。</p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-zinc-600">
      <span className="text-zinc-400">{label}</span>
      <b className={tone}>{value}</b>
    </span>
  );
}

function ToolCard({
  t,
  running,
  onRerun,
}: {
  t: ToolResultSummary;
  running: boolean;
  onRerun: () => void;
}) {
  const meta = STATUSMETA[t.status as keyof typeof STATUSMETA] ?? STATUSMETA.skipped;
  const Icon = TOOL_ICON[t.tool] ?? FileText;
  const StatusIcon = meta.icon;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-900">
              {/* t.label 已包含「工具·候选」时直接用, 否则 fallback 翻译层 */}
              {t.label && t.label !== t.tool ? t.label : (prettyToolLabel(t.tool) || t.label)}
            </p>
            <p className="text-[11px] text-zinc-400">来源: {t.source} · {formatDateTime(t.executed_at)}{t.mock ? " · Mock 数据" : ""}</p>
          </div>
        </div>
        <Badge tone={meta.badge as any}>
          <StatusIcon className={`h-3 w-3 ${meta.color}`} /> {meta.label}
        </Badge>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-zinc-600">{t.summary || "（无摘要）"}</p>

      {(t.evidence_for?.length ?? 0) > 0 && (
        <div className="mt-2.5">
          <p className="mb-1 text-[11px] font-semibold text-orange-600">支持证据</p>
          <ul className="space-y-1">
            {t.evidence_for!.slice(0, 4).map((e, k) => (
              <li key={k} className="flex gap-1.5 text-xs text-zinc-700">
                <span className="text-orange-500">+</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(t.evidence_against?.length ?? 0) > 0 && (
        <div className="mt-2.5">
          <p className="mb-1 text-[11px] font-semibold text-red-500">反对 / 不确定</p>
          <ul className="space-y-1">
            {t.evidence_against!.slice(0, 4).map((e, k) => (
              <li key={k} className="flex gap-1.5 text-xs text-zinc-700">
                <span className="text-red-400">−</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        {t.source && /^https?:\/\//.test(t.source) ? (
          <a href={t.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:underline">
            <ExternalLink className="h-3 w-3" /> 查看来源
          </a>
        ) : <span className="text-[11px] text-zinc-300" />}
        <Button size="sm" variant="ghost" onClick={onRerun} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {running ? "正在验证…" : "重新验证"}
        </Button>
      </div>
    </div>
  );
}

function prettyToolLabel(tool: string): string {
  const map: Record<string, string> = {
    exif: "EXIF 元数据",
    amap_poi_search: "高德地图 POI 搜索",
    amap_geocode: "高德地图 地理编码",
    amap_reverse_geocode: "高德地图 逆地理编码",
    amap_nearby_search: "高德地图 周边搜索",
    overpass_nearby: "OpenStreetMap / Overpass",
    suncalc: "SunCalc 光影计算",
  };
  return map[tool] ?? tool;
}
