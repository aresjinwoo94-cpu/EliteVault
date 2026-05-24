import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // screenshots
    },
  },
  // Allow long-running streamed responses for the analyzer.
  // Fluid Compute on Vercel handles up to 300s for hobby/pro.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default config;
