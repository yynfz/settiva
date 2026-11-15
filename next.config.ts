import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.SETTIVA_TEST_BUILD_DIR || ".next",
};
export default config;
