"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/widgets/Logo";
import { MapBackdrop } from "@/components/widgets/MapBackdrop";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function UnlockPage() {
  return (
    <Suspense fallback={null}>
      <UnlockInner />
    </Suspense>
  );
}

function UnlockInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "邀请密钥不正确");
        setLoading(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("网络错误, 请重试");
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-orange-50/70 to-white" />
      <MapBackdrop />
      <Card className="relative w-full max-w-md border-orange-100 shadow-glow">
        <CardContent className="p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo size={44} />
            <h1 className="mt-3 text-xl font-bold text-zinc-900">橙迹 OrangeTrace</h1>
            <p className="mt-1 text-sm text-zinc-500">图片地理定位 · AI 侦探</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="code">邀请密钥</Label>
              <Input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="请输入邀请密钥"
                required
                autoFocus
                autoComplete="off"
              />
            </div>
            {error && (
              <p className="flex items-center gap-1.5 text-sm text-red-500">
                <AlertTriangle className="h-4 w-4" /> {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> 验证中…
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" /> 进入
                </>
              )}
            </Button>
          </form>
          <div className="mt-5 text-center text-xs">
            <Link href="/privacy" className="text-zinc-400 hover:text-orange-600">
              隐私与安全说明
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
