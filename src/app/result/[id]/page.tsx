"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Navbar, Footer } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AnalyzeProgress } from "@/components/widgets/AnalyzeProgress";
import { ResultReport } from "@/components/widgets/ResultReport";
import { ResultDiscussion } from "@/components/widgets/ResultDiscussion";
import { CrossVerification } from "@/components/widgets/CrossVerification";
import { CandidateMap } from "@/components/widgets/CandidateMap";
import { ConfidenceBadge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import type { AnalysisResult, AnalyzeOptions, ExternalTool } from "@/lib/types";
import {
  ArrowLeft,
  Clock,
  Cpu,
  Hash,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Wrench,
  History,
} from "lucide-react";

interface ResultData {
  id: string;
  status: "pending" | "running" | "verifying" | "success" | "failed";
  created_at: string;
  updated_at?: string;
  filename: string;
  thumb_path?: string;
  image_path?: string;
  options: AnalyzeOptions;
  exif_summary?: any;
  model_name?: string;
  total_tokens?: number;
  duration_ms?: number;
  confidence?: number;
  initial_confidence?: number;
  error?: string;
  result: AnalysisResult | null;
}

export default function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ResultData | null>(null);
  const [tools, setTools] = useState<ExternalTool[]>([]);
  const [loading, setLoading] = useState(true);

  // 手动重新拉取 (重验证后刷新交叉验证模块) — 使用 useCallback 让 children 持有稳定引用
  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/result/${id}`, { cache: "no-store" });
      if (!r.ok) return;
      const json = (await r.json()) as ResultData;
      setData(json);
      // 如果是 verifying (后台还没写回), 继续 1.5s 轮询
      let timer: ReturnType<typeof setTimeout>;
      if (json.status === "verifying" || json.status === "running" || json.status === "pending") {
        setLoading(true);
        timer = setTimeout(reload, 1500);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await fetch(`/api/result/${id}`, { cache: "no-store" });
        if (!r.ok) {
          if (!stop) setLoading(false);
          return;
        }
        const json = (await r.json()) as ResultData;
        if (!stop) setData(json);
        // 如果还在 running/verifying/pending, 继续轮询
        if (json.status === "running" || json.status === "pending" || json.status === "verifying") {
          timer = setTimeout(load, 1500);
        } else {
          if (!stop) setLoading(false);
        }
      } catch {
        if (!stop) setLoading(false);
      }
    };
    load();
    fetch("/api/tools").then((r) => r.json()).then((j) => {
      if (!stop) setTools(j.items ?? []);
    }).catch(() => {});
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push("/analyze")}>
              <ArrowLeft className="h-4 w-4" /> 返回
            </Button>
            <Link
              href="/history"
              className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-orange-600"
            >
              <History className="h-4 w-4" /> 历史记录
            </Link>
          </div>

          {!data && loading && (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 p-12 text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin" /> 加载中…
              </CardContent>
            </Card>
          )}

          {data && (data.status === "running" || data.status === "pending") && (
            <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
              <Card className="overflow-hidden">
                {data.thumb_path && (
                  <div className="relative bg-zinc-900">
                    <div className="scanline z-10" />
                    <Image
                      src={data.thumb_path}
                      alt={data.filename}
                      width={1200}
                      height={800}
                      className="max-h-80 w-full object-contain"
                      unoptimized
                    />
                  </div>
                )}
                <CardContent className="p-5">
                  <p className="font-medium text-zinc-800">{data.filename}</p>
                  <p className="mt-1 text-xs text-zinc-400">提交于 {formatDateTime(data.created_at)}</p>
                </CardContent>
              </Card>
              <Card className="border-orange-200">
                <CardContent className="p-5 sm:p-6">
                  <AnalyzeProgress running={true} />
                </CardContent>
              </Card>
            </div>
          )}

          {data && data.status === "failed" && (
            <Card className="border-red-200">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-6 w-6 text-red-500" />
                  <div>
                    <h2 className="text-lg font-semibold text-red-700">分析失败</h2>
                    <p className="mt-1 text-sm text-zinc-600">{data.error || "未知错误"}</p>
                    <p className="mt-2 text-xs text-zinc-400">提交时间：{formatDateTime(data.created_at)}</p>
                    <div className="mt-4">
                      <Link href="/analyze">
                        <Button size="sm"><ArrowLeft className="h-4 w-4" /> 重新上传</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {data && data.status === "success" && data.result && (
            <div className="space-y-6">
              {/* 重新验证中提示 (后台 verify 进行时) */}
              {(data as any).stage === "tools" && (
                <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3 text-sm text-orange-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  工具正在重新验证中, 证据与置信度稍后会刷新…
                </div>
              )}
              {/* 顶部图片 + 元信息 */}
              <Card className="overflow-hidden">
                <div className="grid lg:grid-cols-[1.5fr_1fr]">
                  {data.thumb_path && (
                    <div className="relative bg-zinc-900">
                      <Image
                        src={data.thumb_path}
                        alt={data.filename}
                        width={1200}
                        height={800}
                        className="max-h-80 w-full object-contain"
                        unoptimized
                      />
                    </div>
                  )}
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="green">分析完成</Badge>
                      <ConfidenceBadge score={data.confidence} />
                    </div>
                    <p className="mt-3 font-medium text-zinc-800 truncate">{data.filename}</p>
                    <dl className="mt-3 space-y-1.5 text-xs text-zinc-500">
                      <Meta icon={Clock} label="提交时间" value={formatDateTime(data.created_at)} />
                      {data.model_name && (
                        <Meta icon={Cpu} label="模型" value={data.model_name} />
                      )}
                      {data.duration_ms != null && (
                        <Meta icon={Clock} label="耗时" value={`${(data.duration_ms / 1000).toFixed(1)}s`} />
                      )}
                      {data.total_tokens ? (
                        <Meta icon={Hash} label="Token" value={`${data.total_tokens}`} />
                      ) : null}
                    </dl>
                  </div>
                </div>
              </Card>

              {/* 侦探报告 */}
              <ResultReport result={data.result} />

              {/* 交叉验证模块 + 候选地点地图 */}
              <div className="grid gap-6">
                <CrossVerification
                  analysisId={data.id}
                  summary={data.result.cross_verification}
                  toolResults={data.result.tool_results}
                  onChanged={() => reload()}
                />
                <CandidateMap candidates={data.result.candidate_locations} />
              </div>

              {/* 结果交流对话框 */}
              <ResultDiscussion analysisId={data.id} />

              {/* 推荐验证工具 */}
              {tools.length > 0 && (
                <Card>
                  <CardContent className="p-5 sm:p-6">
                    <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-zinc-900">
                      <Wrench className="h-4 w-4 text-orange-500" /> 推荐验证工具
                    </h3>
                    <p className="mb-4 text-sm text-zinc-500">人工复核时可以使用的公开工具。</p>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {tools.map((t) => (
                        <a
                          key={t.id}
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-2.5 rounded-xl border border-zinc-200 p-3 transition-colors hover:border-orange-300 hover:bg-orange-50/50"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                            <ExternalLink className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-800 group-hover:text-orange-700">{t.name}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{t.description}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {(data.options.detailed_reasoning || data.result.clues?.exif?.length) && (
                <Card className="bg-zinc-50/60">
                  <CardContent className="p-5 text-xs text-zinc-500">
                    <p className="font-medium text-zinc-600">关于本次分析</p>
                    <p className="mt-1">
                      若允许读取 EXIF，且图片包含 GPS 元数据，则该信息被视为最可靠线索优先使用；否则模型仅依据图像内容推理。
                      上述结果是 AI 推理，可能出错，请务必人工复核。
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Meta({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-zinc-400" />
      <span className="text-zinc-400">{label}:</span>
      <span className="text-zinc-600">{value}</span>
    </div>
  );
}
