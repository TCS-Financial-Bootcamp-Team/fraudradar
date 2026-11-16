import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Idioma pelo cookie NEXT_LOCALE, sem rota por idioma (src/i18n/request.ts).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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

export default withNextIntl(nextConfig);
