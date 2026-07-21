"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Navbar, Footer } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { MapBackdrop } from "@/components/widgets/MapBackdrop";
import { Logo } from "@/components/widgets/Logo";
import {
  Check,
  Loader2,
  ShieldCheck,
  Lock,
  AlertTriangle,
  ScanLine,
  FileText,
  Building2,
  Car,
  MapPinned,
  FileBarChart,
} from "lucide-react";

interface ResultData {
  id: string;
  status: "pending" | "running" | "verifying" | "success" | "failed";
  stage?: string;
  progress?: number;
  created_at: string;
  filename: string;
  thumb_path?: string;
  error?: string;
  tool_status?: Array<{ tool: string; label: string; status: string; enabled: boolean }>;
}

/** 6 阶段 (规范第九节). 顺序与 stage 对齐。 */
const STAGES = [
  { key: "preprocess", label: "正在读取图片与元数据" },
  { key: "initial", label: "正在识别文字、建筑、道路与自然环境" },
  { key: "candidate", label: "正在生成候选地点" },
  { key: "tools", label: "正在调用地图和 OSINT 工具" },
  { key: "cross", label: "正在交叉验证支持与反对证据" },
  { key: "report", label: "正在生成最终侦探报告" },
];
const STAGE_ORDER = STAGES.map((s) => s.key);

/** 前端展示用的图标 / 步描述 (按规范第九节) */
const STEPS = [
  { icon: FileText, label: "正在读取图片与元数据" },
  { icon: Building2, label: "正在识别文字、建筑、道路与自然环境" },
  { icon: MapPinned, label: "正在生成候选地点" },
  { icon: Car, label: "正在调用地图和 OSINT 工具" },
  { icon: Building2, label: "正在交叉验证支持与反对证据" },
  { icon: FileBarChart, label: "正在生成最终侦探报告" },
];

const STATUS_LABEL = (s: string): { label: string; tone: string } => {
  switch (s) {
    case "success": return { label: "已完成", tone: "text-orange-700" };
    case "failed": return { label: "失败", tone: "text-red-600" };
    case "pending": return { label: "验证中", tone: "text-orange-600" };
    case "skipped": return { label: "已跳过", tone: "text-zinc-400" };
    case "waiting": return { label: "等待中", tone: "text-zinc-400" };
    default: return { label: s, tone: "text-zinc-500" };
  }
};

export default function AnalyzingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [data, setData] = useState<ResultData | null>(null);
  // 模拟推进不能跑太快, 留出 stage 真实推进的空间; 最多到对应 stage 当前位置。
  const [reached, setReached] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const lastTick = useRef(Date.now());

  // 仅在还没拿到后端 stage / progress 时靠模拟推进; 拿到后切换到 stage 驱动。
  useEffect(() => {
    // stageIdx 表示后端当前推进到第几阶段 (0..5)
    const stageIdx = data?.stage ? STAGE_ORDER.indexOf(data.stage) : -1;
    const target = stageIdx >= 0 ? Math.min(STEPS.length - 1, stageIdx) : Math.min(STEPS.length - 1, reached);
    if (reached >= target) return;
    const t = setTimeout(() => setReached((r) => Math.min(STEPS.length, r + 1)), 1500);
    return () => clearTimeout(t);
  }, [reached, data?.stage]);

  // 轮询真实状态
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const r = await fetch(`/api/result/${id}`, { cache: "no-store" });
        if (r.status === 404) {
          if (!stop) setNotFound(true);
          return;
        }
        if (!r.ok) return;
        const json = (await r.json()) as ResultData;
        if (!stop) setData(json);

        if (json.status === "success") {
          // 全部步骤标记完成, 稍等片晌跳转结果页
          setReached(STEPS.length);
          setTimeout(() => router.replace(`/result/${id}`), 700);
          return;
        }
        if (json.status === "failed") {
          // 失败时让前端也展示, 用户可看到错误
          return;
        }
        // 仍 running/verifying -> 继续轮询
        timer = setTimeout(poll, 1500);
      } catch {
        // 网络抖动: 再试
        timer = setTimeout(poll, 2500);
      }
    };
    poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, router]);

  // 进度优先用后端给的 progress, 否则按 reached 推算
  const pct = data?.progress ?? Math.round((reached / STEPS.length) * 100);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="relative flex-1">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-50/60 via-white to-white" />
        <MapBackdrop />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center px-4 py-12 sm:py-16">
          {/* 标题区 */}
          <div className="mb-6 flex items-center gap-2 text-orange-600">
            <div className="relative">
              <Logo size={40} />
              <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-orange-400" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest">
              OrangeTrace Detection
            </span>
          </div>
          <h1 className="text-center text-2xl font-bold text-zinc-900 sm:text-3xl">
            AI 侦探工作中<span className="animate-pulse">…</span>
          </h1>
          <p className="mt-2 text-center text-sm text-zinc-500">
            正在逐项核查图片中的文字、建筑、道路、自然地理与光影线索。
          </p>

          {/* 记录不存在 */}
          {notFound && (
            <Card className="mt-8 w-full border-red-200">
              <CardContent className="p-6 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
                <h2 className="mt-3 text-lg font-semibold text-red-700">分析任务不存在</h2>
                <p className="mt-1 text-sm text-zinc-500">id: {id}</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button size="sm" onClick={() => router.push("/analyze")}>
                    <ScanLine className="h-4 w-4" /> 重新上传
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 失败状态 */}
          {data?.status === "failed" && (
            <Card className="mt-8 w-full border-red-200">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-6 w-6 text-red-500" />
                  <div>
                    <h2 className="text-lg font-semibold text-red-700">分析失败</h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      {data.error || "未知错误，请检查后台模型配置。"}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" onClick={() => router.push("/analyze")}>
                        <ScanLine className="h-4 w-4" /> 重新上传
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 正常/等待态: 居中卡片 */}
          {!notFound && !(data?.status === "failed") && (
            <>
              {/* 缩略图预览 (扫描线效果) */}
              {data?.thumb_path && (
                <div className="relative mt-8 w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-900">
                  <div className="scanline z-10" />
                  <Image
                    src={data.thumb_path}
                    alt={data.filename}
                    width={1200}
                    height={800}
                    className="max-h-64 w-full object-contain"
                    unoptimized
                  />
                  <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-orange-400/40" />
                </div>
              )}

              {/* 进度卡 */}
              <Card className="mt-6 w-full border-orange-200">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-700">侦查进度</span>
                    <span className="text-sm font-semibold tabular-nums text-orange-600">
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-orange-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <ul className="mt-5 space-y-2.5">
                    {STEPS.map((s, i) => {
                      const state = i < reached ? "done" : i === reached ? "active" : "todo";
                      return (
                        <li
                          key={i}
                          className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-all ${
                            state === "done"
                              ? "border-orange-200 bg-orange-50/60"
                              : state === "active"
                                ? "border-orange-300 bg-white shadow-glow"
                                : "border-zinc-100 bg-zinc-50/60"
                          }`}
                        >
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                              state === "done"
                                ? "bg-orange-500 text-white"
                                : state === "active"
                                  ? "bg-orange-100 text-orange-600"
                                  : "bg-zinc-200 text-zinc-400"
                            }`}
                          >
                            {state === "done" ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : state === "active" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              i + 1
                            )}
                          </span>
                          <span
                            className={`flex flex-1 items-center gap-2 text-sm ${
                              state === "todo" ? "text-zinc-400" : "text-zinc-700"
                            }`}
                          >
                            <s.icon className="h-4 w-4 opacity-70" />
                            {s.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>

              {/* 实时工具状态区 (规范第九节) */}
              {data?.tool_status && data.tool_status.length > 0 && (
                <Card className="mt-4 w-full">
                  <CardContent className="p-5 sm:p-6">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700">
                      <ShieldCheck className="h-4 w-4 text-orange-500" /> 工具执行状态
                    </h3>
                    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {data.tool_status.map((t) => {
                        const meta = STATUS_LABEL(t.status);
                        return (
                          <li key={t.tool} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50/70 px-3 py-2 text-xs">
                            <span className="min-w-0 flex items-center gap-1.5">
                              {t.status === "pending" ? (
                                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-orange-500" />
                              ) : t.status === "success" ? (
                                <Check className="h-3 w-3 shrink-0 text-orange-600" />
                              ) : (
                                <span className="h-3 w-3 shrink-0 rounded-full bg-zinc-300" />
                              )}
                              <span className="truncate text-zinc-700">{t.label}</span>
                            </span>
                            <span className={`shrink-0 font-medium ${meta.tone}`}>{meta.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                    {!data?.tool_status?.some((t) => t.status === "success" || t.status === "pending") && (
                      <p className="mt-2 text-[11px] text-zinc-400">
                        未配置 API Key 的工具会自动跳过, 不影响整体分析。
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* 隐私提示 */}
              <div className="mt-6 flex max-w-md items-start gap-2 rounded-xl bg-white/70 p-3.5 text-xs text-zinc-500 ring-1 ring-zinc-100">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                <p>
                  图片仅用于本次分析。原图默认
                  <ShieldCheck className="mx-0.5 inline h-3 w-3 text-orange-500" />
                  24 小时后自动删除，具体策略由管理员配置。
                </p>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
