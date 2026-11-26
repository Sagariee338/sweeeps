import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  output: "standalone",
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.DJANGO_API_ORIGIN || "http://127.0.0.1:8001"}/api/v1/:path*/`,
      },
      {
        source: "/health/",
        destination: `${process.env.DJANGO_API_ORIGIN || "http://127.0.0.1:8001"}/health/`,
      },
    ];
  },
};

export default nextConfig;
