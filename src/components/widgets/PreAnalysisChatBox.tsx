"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Sparkles, Send, Check } from "lucide-react";

interface Props {
  /** 受控的补充线索文本 */
  value: string;
  onChange: (v: string) => void;
}

/**
 * 上传页左侧下方的「补充给 AI 的线索」对话框卡。
 * 这不是聊天历史, 只是本次分析前给模型补充的自由上下文;
 * 点击「提交补充信息」后, 内容会同步到分析任务的 additional_context。
 */
export function PreAnalysisChatBox({ value, onChange }: Props) {
  const [submitted, setSubmitted] = useState(false);

  const submit = () => {
    if (!value.trim()) return;
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 1800);
  };

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-900">补充给 AI 的线索</h2>
            <p className="text-xs text-zinc-500">
              你可以告诉 AI 这张图的大致背景、拍摄时间、你已经知道的区域，或希望重点分析的方向。
            </p>
          </div>
        </div>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder="例如：这张图可能在东欧，拍摄于冬天；请重点分析路牌、建筑风格和植被。"
          className="mt-4 flex min-h-[110px] w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
        />

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            {value.trim() ? `${value.trim().length} 字 · 将随分析一起提交` : "可留空"}
          </span>
          <Button type="button" onClick={submit} disabled={!value.trim()} size="sm">
            {submitted ? (
              <>
                <Check className="h-4 w-4" /> 已记录
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> 提交补充信息
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
