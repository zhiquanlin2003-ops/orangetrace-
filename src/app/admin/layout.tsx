import AdminShell from "./AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // 登录页自己渲染, 不套侧边栏
  return <AdminShell>{children}</AdminShell>;
}
