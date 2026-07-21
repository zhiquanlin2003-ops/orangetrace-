import * as React from "react";
import { cn } from "@/lib/utils";

type Tone =
  | "orange"
  | "green"
  | "red"
  | "yellow"
  | "blue"
  | "zinc"
  | "purple";

const tones: Record<Tone, string> = {
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  yellow: "bg-yellow-50 text-yellow-700 ring-yellow-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  zinc: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-200",
};

export function Badge({
  tone = "zinc",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** 置信度徽章, 自动根据分数染色 */
export function ConfidenceBadge({ score }: { score?: number | null }) {
  if (score == null) return <Badge tone="zinc">置信度未知</Badge>;
  const s = Math.max(0, Math.min(100, score));
  if (s >= 70) return <Badge tone="green">置信度 高 · {s}</Badge>;
  if (s >= 40) return <Badge tone="yellow">置信度 中 · {s}</Badge>;
  return <Badge tone="red">置信度 低 · {s}</Badge>;
}
