"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  User,
  RefreshCw,
} from "lucide-react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  analysisId: string;
  /** 分析未完成时禁用对话 */
  disabled?: boolean;
}

/**
 * 结果交流对话框: 用户可针对当前分析结果继续追问 / 纠错 / 补充。
 * 消息 MVP 阶段仅存在前端状态 + (可选) localStorage, 结构上方便后续持久化到 DB。
 */
export function ResultDiscussion({ analysisId, disabled }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 从 localStorage 恢复历史 (按 analysisId 隔离)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ot_chat_${analysisId}`);
      if (raw) {
        const arr = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(arr) && arr.length) {
          setMessages(arr);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    // 默认 AI 提示
    setMessages([
      {
        role: "assistant",
        content:
          "我已经完成了初步地理定位分析。你可以告诉我哪里不对，或让我进一步验证某个候选地点。",
      },
    ]);
  }, [analysisId]);

  // 持久化 + 自动滚动
  useEffect(() => {
    try {
      localStorage.setItem(`ot_chat_${analysisId}`, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, analysisId]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || disabled) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`/api/discuss/${analysisId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `请求失败 (${res.status})`);
        // 失败时回退用户消息, 便于重试
        setMessages(messages);
        return;
      }
      setMessages([...next, { role: "assistant", content: data.reply || "（无回复）" }]);
    } catch (e) {
      setError((e as Error).message || "网络错误");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送, Shift+Enter 换行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const reset = () => {
    if (!confirm("清空当前对话历史？")) return;
    setMessages([
      {
        role: "assistant",
        content:
          "对话已清空。你可以基于当前分析结果继续提问。",
      },
    ]);
  };

  if (disabled) {
    return (
      <Card className="border-zinc-200 bg-zinc-50/60">
        <CardContent className="flex items-center gap-2 p-5 text-sm text-zinc-400">
          <MessageSquare className="h-4 w-4" /> 结果生成后即可在此与 AI 继续讨论。
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex h-full flex-col p-5 sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900">和 AI 继续讨论这个结果</h2>
              <p className="text-xs text-zinc-500">
                你可以补充新的线索、指出 AI 判断不准确的地方，或让 AI 重新比较候选地点。
              </p>
            </div>
          </div>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            title="清空对话"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 重置
          </button>
        </div>

        {/* 消息区 */}
        <div
          ref={scrollRef}
          className="mb-3 max-h-[360px] min-h-[200px] flex-1 space-y-3 overflow-y-auto rounded-xl border border-zinc-100 bg-zinc-50/50 p-3"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2",
                m.role === "user" ? "flex-row-reverse" : "flex-row",
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  m.role === "user"
                    ? "bg-zinc-200 text-zinc-600"
                    : "bg-orange-100 text-orange-600",
                )}
              >
                {m.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </div>
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "rounded-tr-sm bg-zinc-800 text-white"
                    : "rounded-tl-sm bg-white text-zinc-700 ring-1 ring-zinc-100",
                )}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Sparkles className="h-4 w-4 animate-pulse text-orange-400" />
              AI 正在结合当前结果思考…
            </div>
          )}
        </div>

        {error && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-red-500">
            {error}
          </p>
        )}

        {/* 输入区 */}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="例如：这个地点不对，我觉得更像东京；或 让我看看哪个候选最有可能是火车站附近。"
            className="flex min-h-[48px] flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
          />
          <Button onClick={send} disabled={!input.trim() || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            发送
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">
          Enter 发送 · Shift+Enter 换行。对话仅在本机暂存，清空浏览器记录后消失。
        </p>
      </CardContent>
    </Card>
  );
}
