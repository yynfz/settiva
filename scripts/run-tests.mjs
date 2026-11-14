import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const run = (files, extraEnv = {}) => {
  const result = spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", ...files],
    { stdio: "inherit", env: { ...process.env, ...extraEnv } },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(args);
if (args.length === 0)
  run(["tests/fallback.http.test.ts"], { SETTIVA_TEST_ASSET: "test-token" });
