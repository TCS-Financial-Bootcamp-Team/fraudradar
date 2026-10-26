import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.FRAUDRADAR_TEST_DIST ?? ".next",
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
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
