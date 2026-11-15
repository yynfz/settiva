import type { NextConfig } from "next";
const config: NextConfig = {
  typescript: {
    tsconfigPath: process.env.SETTIVA_TEST_TSCONFIG || "tsconfig.json",
  },
  distDir: process.env.SETTIVA_TEST_BUILD_DIR || ".next",
};
export default config;
