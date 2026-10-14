import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare quick tunnels (and other public HTTPS frontends) must be
  // allowlisted or Next 16 blocks /_next/* with 403 and the UI never hydrates.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.trycloudflare.com",
    "apollo-refrigerator-prefix-futures.trycloudflare.com",
  ],
  async redirects() {
    return [{ source: "/ads", destination: "/creatives", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
