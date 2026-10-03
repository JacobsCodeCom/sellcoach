import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mira/core"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@mira/core": path.resolve(__dirname, "../../packages/core/src"),
    };
    return config;
  },
};

export default nextConfig;
