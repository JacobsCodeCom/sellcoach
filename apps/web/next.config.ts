import type { NextConfig } from "next";
import path from "path";

/** Optional: set CHROME_EXTENSION_ID after store publish to lock framing to that ID. */
const chromeExtensionFrameAncestors = process.env.CHROME_EXTENSION_ID?.trim()
  ? `chrome-extension://${process.env.CHROME_EXTENSION_ID.trim()}`
  : "chrome-extension:";

const frameAncestors = `frame-ancestors 'self' ${chromeExtensionFrameAncestors}`;

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
  async headers() {
    return [
      {
        // Allow the Chrome extension side panel to embed expert routes.
        source: "/ext/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: frameAncestors,
          },
          {
            key: "Permissions-Policy",
            value: "microphone=(self), display-capture=(self), camera=()",
          },
        ],
      },
      {
        source: "/invite/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: frameAncestors,
          },
        ],
      },
      {
        source: "/login",
        headers: [
          {
            key: "Content-Security-Policy",
            value: frameAncestors,
          },
        ],
      },
      {
        source: "/signup",
        headers: [
          {
            key: "Content-Security-Policy",
            value: frameAncestors,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
