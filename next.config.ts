import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sharp"],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
    // Next 15 默认完全跳过 PostCSS, 让 Tailwind v4 v0 处理失败
    // 强制启用 PostCSS 让我们 postcss.config.mjs 里的 @tailwindcss/postcss plugin 生效
    optimizePackageImports: ["lucide-react"],
  },
  // 强制开启 PostCSS 配置 (Next 15.1.4 默认可能跳过)
  // 这样 @tailwindcss/postcss 会被加载, CSS 被正确编译
  webpack: (config, { isServer }) => {
    return config;
  },
};

export default nextConfig;
