import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack is the default dev server in Next.js 16.
  // WASM is supported natively; no extra config needed.
  turbopack: {},

  // webpack config applies to production builds (next build).
  webpack(config) {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

export default nextConfig;
