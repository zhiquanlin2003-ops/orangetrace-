"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/widgets/Logo";
import { MapBackdrop } from "@/components/widgets/MapBackdrop";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Loader2, Lock, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/admin";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "登录失败");
        setLoading(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
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
            <h1 className="mt-3 text-xl font-bold text-zinc-900">管理后台登录</h1>
            <p className="mt-1 text-sm text-zinc-500">橙迹 OrangeTrace · Admin</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="u">用户名</Label>
              <Input
                id="u"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
              />
            </div>
            <div>
              <Label htmlFor="p">密码</Label>
              <Input
                id="p"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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
                  <Loader2 className="h-5 w-5 animate-spin" /> 登录中…
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" /> 登录
                </>
              )}
            </Button>
          </form>
          <div className="mt-5 rounded-lg bg-zinc-50 p-3 text-center text-xs text-zinc-400">
            默认账号 <code className="text-orange-600">admin</code> /{" "}
            <code className="text-orange-600">admin123</code>，可在 <code>.env.local</code> 修改
          </div>
          <div className="mt-3 text-center text-xs">
            <Link href="/" className="text-zinc-400 hover:text-orange-600">
              ← 返回前台首页
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
