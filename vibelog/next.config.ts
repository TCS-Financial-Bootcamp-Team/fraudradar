import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  agentRules: false,
  distDir: process.env.VIBELOG_TEST_DIST ?? ".next",
  turbopack: { root: path.resolve(process.cwd()) },
};
export default config;
