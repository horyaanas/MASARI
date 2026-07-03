import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  headers: async () => [
    {
      // Service worker must NEVER be cached by the browser — always revalidate
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
    {
      // version.json must always be fresh — used for update detection
      source: "/version.json",
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
      ],
    },
    {
      // HTML pages: prevent the browser HTTP cache from serving stale HTML.
      // The SW still caches HTML for offline use, but uses network-first.
      source: "/((?!_next/static|_next/image|icons|manifest.json|sw.js|version.json).*)",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
      ],
    },
  ],
};

export default nextConfig;
