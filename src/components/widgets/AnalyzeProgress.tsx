"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

export interface StepDef {
  key: string;
  label: string;
  /** 模拟每步用时 (ms), 让仪式感更真实 */
  minMs?: number;
  maxMs?: number;
}

export const DEFAULT_STEPS: StepDef[] = [
  { key: "ocr", label: "正在识别图片中的文字与符号", minMs: 1800, maxMs: 3200 },
  { key: "visual", label: "正在分析建筑、道路、车辆、植被等视觉线索", minMs: 2200, maxMs: 3800 },
  { key: "geo", label: "正在判断可能的国家 / 城市 / 区域", minMs: 2000, maxMs: 3400 },
  { key: "cross", label: "正在交叉验证候选地点", minMs: 1800, maxMs: 3000 },
  { key: "report", label: "正在生成结论报告", minMs: 1500, maxMs: 2600 },
];

interface Props {
  /** 已经真正完成了几步 (来自后端真实进度)。0 表示尚未开始。 */
  completedReal?: number;
  /** 当前是否还在运行 */
  running: boolean;
  steps?: StepDef[];
  onAllSimulated?: () => void;
}

/**
 * 上传后的分析进度展示。
 * 设计为: 在等待真实后端返回期间, 自动按时间节奏推进步骤,
 * 营造 "AI 正在侦查线索" 的仪式感, 同时不阻塞实际请求。
 */
export function AnalyzeProgress({
  completedReal,
  running,
  steps = DEFAULT_STEPS,
  onAllSimulated,
}: Props) {
  // simulatedStep = 已"演员式"展示到第几步 (索引, 0-based)
  const [simulatedStep, setSimulatedStep] = useState(0);
  const total = steps.length;

  useEffect(() => {
    if (!running) return;
    if (simulatedStep >= total) {
      onAllSimulated?.();
      return;
    }
    const def = steps[simulatedStep];
    const wait =
      Math.min(def.maxMs ?? 3000, Math.max(def.minMs ?? 1500, 1500)) *
      (0.85 + Math.random() * 0.3);
    const t = setTimeout(() => {
      setSimulatedStep((s) => Math.min(total, s + 1));
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulatedStep, running, total]);

  // 真实进度感知: 若后端已完成更多步, 取较大值
  const reachable = Math.max(simulatedStep, completedReal ?? 0);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-zinc-700">
          AI 侦探工作中…
        </span>
        <span className="text-xs tabular-nums text-orange-600">
          {Math.round((reachable / total) * 100)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-orange-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-700"
          style={{ width: `${(reachable / total) * 100}%` }}
        />
      </div>
      <ul className="mt-5 space-y-2.5">
        {steps.map((s, i) => {
          const state =
            i < reachable
              ? "done"
              : i === reachable && running
                ? "active"
                : "todo";
          return (
            <li
              key={s.key}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-all",
                state === "done" && "border-orange-200 bg-orange-50/60",
                state === "active" &&
                  "border-orange-300 bg-white shadow-glow",
                state === "todo" && "border-zinc-100 bg-zinc-50/60",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  state === "done" && "bg-orange-500 text-white",
                  state === "active" && "bg-orange-100 text-orange-600",
                  state === "todo" && "bg-zinc-200 text-zinc-400",
                )}
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
                className={cn(
                  "text-sm",
                  state === "todo" ? "text-zinc-400" : "text-zinc-700",
                )}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
