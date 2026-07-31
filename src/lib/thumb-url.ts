/**
 * 把 `/uploads/xxx.jpg` 转成 `/api/uploads/xxx.jpg`
 *
 * Next.js production 模式下 public/ 目录是 build 时静态拷贝的,
 * 运行时写入的缩略图不会被自动 serve.
 * 通过 /api/uploads/[...path] 动态 route 来读文件.
 */
export function thumbUrl(path?: string | null): string {
  if (!path) return "";
  if (path.startsWith("/uploads/")) {
    return path.replace("/uploads/", "/api/uploads/");
  }
  return path;
}
