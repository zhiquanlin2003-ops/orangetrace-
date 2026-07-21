"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { Navbar, Footer } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Progress";
import { PreAnalysisChatBox } from "@/components/widgets/PreAnalysisChatBox";
import {
  ImageUp,
  ScanLine,
  X,
  Lock,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  Clock,
  MapPin,
} from "lucide-react";

const MAX_BYTES = 20 * 1024 * 1024; // 20MB

export default function AnalyzePage() {
  // (useRouter removed: 跳转改用 window.location.assign 保证 navigate 一定发生)
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // options
  const [capturedAt, setCapturedAt] = useState("");
  const [allowExif, setAllowExif] = useState(true);
  const [knownRegion, setKnownRegion] = useState("");
  const [detailedReasoning, setDetailedReasoning] = useState(true);
  const [privacyAck, setPrivacyAck] = useState(false);
  const [additionalContext, setAdditionalContext] = useState("");

  // submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const reset = () => {
    setPreview(null);
    setFileMeta(null);
    setBase64(null);
    setError(null);
  };

  const handleFile = useCallback((f: File) => {
    setError(null);
    if (!f.type.startsWith("image/")) {
      setError("请选择图片文件 (JPG / PNG / WebP)");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("图片过大，请压缩到 20MB 以内");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreview(result);
      setBase64(result);
      setFileMeta({ name: f.name, size: f.size });
    };
    reader.onerror = () => setError("读取文件失败");
    reader.readAsDataURL(f);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const onSubmit = async () => {
    setError(null);
    setSubmitError(null);
    // 友好的校验: 缺图片 / 权限
    if (!base64) {
      setError("请先上传一张图片");
      return;
    }
    if (!privacyAck) {
      setError("请先勾选隐私与使用声明");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64,
          filename: fileMeta?.name,
          options: {
            captured_at: capturedAt || undefined,
            allow_exif: allowExif,
            known_region: knownRegion || undefined,
            detailed_reasoning: detailedReasoning,
            privacy_acknowledged: privacyAck,
            additional_context: additionalContext || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitting(false);
        setSubmitError(data?.error || `请求失败 (${res.status})`);
        return;
      }
      // 创建成功 -> 跳转独立「分析中」页面。
      // 直接用 window.location.href 硬跳, 避免 Next.js App Router client navigation
      // 在某些 hot-reload / prefetch 状态下不触发 navigate 的现象。
      if (data?.id) {
        window.location.assign(`/analyzing/${data.id}`);
        return;
      }
      // 没拿到 id → 提示并解锁按钮
      setSubmitting(false);
      setSubmitError("服务端未返回任务 id, 请稍后再试");
    } catch (e) {
      setSubmitting(false);
      setSubmitError((e as Error).message || "网络错误");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
              图片地理定位分析
            </h1>
            <p className="mt-1.5 text-zinc-500">
              上传一张图片，AI 将逐项侦查线索并给出候选地点与可解释的推理过程。
            </p>
          </div>

          {/* 两列网格, items-start 保证左右顶部对齐 */}
          <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
            {/* ===== 左列: 上传卡 + 补充线索对话框 ===== */}
            <div className="space-y-6">
              <Card>
                <CardContent className="p-5 sm:p-6">
                  {!preview ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={onDrop}
                      onClick={() => inputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      className={`relative flex h-72 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-all ${
                        dragOver
                          ? "border-orange-400 bg-orange-50"
                          : "border-zinc-200 bg-zinc-50/50 hover:border-orange-300 hover:bg-orange-50/40"
                      }`}
                    >
                      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                        <ImageUp className="h-7 w-7" />
                      </div>
                      <p className="text-base font-medium text-zinc-700">
                        拖拽图片到此处，或点击选择
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        支持 JPG / PNG / WebP，单张 ≤ 20MB
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-900">
                        <Image
                          src={preview}
                          alt="预览"
                          width={1200}
                          height={800}
                          className="max-h-[26rem] w-full object-contain"
                          unoptimized
                        />
                        {/* 识别框装饰 */}
                        <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-orange-400/30" />
                        <div className="pointer-events-none absolute left-6 top-6 h-5 w-5 border-l-2 border-t-2 border-orange-400" />
                        <div className="pointer-events-none absolute right-6 top-6 h-5 w-5 border-r-2 border-t-2 border-orange-400" />
                        <div className="pointer-events-none absolute bottom-6 left-6 h-5 w-5 border-b-2 border-l-2 border-orange-400" />
                        <div className="pointer-events-none absolute bottom-6 right-6 h-5 w-5 border-b-2 border-r-2 border-orange-400" />
                      </div>
                      {!submitting && (
                        <button
                          onClick={reset}
                          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-zinc-600 shadow hover:text-red-500"
                          aria-label="移除图片"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      {fileMeta && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                          <MapPin className="h-3.5 w-3.5 text-orange-500" />
                          {fileMeta.name} · {(fileMeta.size / 1024).toFixed(0)} KB
                        </div>
                      )}
                    </div>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                      e.target.value = "";
                    }}
                  />
                  {error && (
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-red-500">
                      <AlertTriangle className="h-4 w-4" /> {error}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* 左侧下方: 补充线索对话框 (宽度与上方上传卡一致) */}
              <PreAnalysisChatBox value={additionalContext} onChange={setAdditionalContext} />
            </div>

            {/* ===== 右列: 补充信息表单 ===== */}
            <div className="space-y-5">
              <Card>
                <CardContent className="space-y-4 p-5 sm:p-6">
                  <h2 className="text-base font-semibold text-zinc-900">补充信息（可选）</h2>

                  <div>
                    <Label htmlFor="captured_at">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-zinc-400" /> 大概拍摄时间
                      </span>
                    </Label>
                    <Input
                      id="captured_at"
                      type="datetime-local"
                      value={capturedAt}
                      onChange={(e) => setCapturedAt(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="known_region">已知大致国家 / 城市</Label>
                    <Input
                      id="known_region"
                      placeholder="例如：中国 · 上海"
                      value={knownRegion}
                      onChange={(e) => setKnownRegion(e.target.value)}
                    />
                  </div>

                  <ToggleRow
                    label="允许读取 EXIF 元数据"
                    desc="若图片含 GPS / 时间 / 设备信息，会优先作为可靠线索。"
                    checked={allowExif}
                    onChange={setAllowExif}
                  />
                  <ToggleRow
                    label="输出详细推理过程"
                    desc="让模型把推理步骤写得更充分。"
                    checked={detailedReasoning}
                    onChange={setDetailedReasoning}
                  />

                  <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3.5">
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={privacyAck}
                        onChange={(e) => setPrivacyAck(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-400"
                      />
                      <span className="text-xs leading-relaxed text-zinc-600">
                        我确认拥有该图片的分析权限，且不会将结果用于<strong className="text-orange-700">人肉搜索、跟踪、骚扰或侵犯他人隐私</strong>。
                        我已阅读并同意
                        <a href="/privacy" className="mx-0.5 underline text-orange-700">隐私与安全说明</a>。
                      </span>
                    </label>
                  </div>

                  <Button
                    onClick={onSubmit}
                    disabled={submitting || !base64 || !privacyAck}
                    className="w-full"
                    size="lg"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" /> 正在创建分析任务…
                      </>
                    ) : (
                      <>
                        <ScanLine className="h-5 w-5" /> 开始分析
                      </>
                    )}
                  </Button>

                  {/* 友好的禁用提示 */}
                  {!base64 && (
                    <p className="text-center text-xs text-zinc-400">
                      请先上传图片后即可开始分析
                    </p>
                  )}
                  {base64 && !privacyAck && (
                    <p className="text-center text-xs text-zinc-400">
                      请勾选上方隐私与使用声明
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-start gap-2 rounded-xl bg-zinc-50 p-3.5 text-xs text-zinc-500">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                <p>
                  图片仅用于本次分析。原图默认
                  <ShieldCheck className="mx-0.5 inline h-3 w-3 text-orange-500" />
                  24 小时后自动删除，具体策略由管理员配置。
                </p>
              </div>
            </div>
          </div>

          {/* 提交错误卡 */}
          {submitError && (
            <div className="mt-5">
              <Card className="border-red-200 bg-red-50/50">
                <CardContent className="flex items-start gap-2 p-4 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">分析未完成</p>
                    <p className="mt-0.5 text-red-600">{submitError}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-100 p-3">
      <div>
        <p className="text-sm font-medium text-zinc-800">{label}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
