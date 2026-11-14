import { test, expect } from "vitest";
import { environment, request } from "./support/context";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("the fallback landing page does not claim USDC settlement", async () => {
  expect(await (await request("/")).text()).not.toContain("Settle with USDC");
});

test("the read-only diagnostic uses the selected fallback and requires explicit decimals", async () => {
  const run = promisify(execFile);
  const env = {
    ...process.env,
    NEAR_TESTNET_RPC_URL: `${environment().supabaseUrl}/rpc`,
    NEAR_TESTNET_ASSET: "test-token",
    NEAR_TESTNET_TEST_TOKEN_CONTRACT: "demo-token.testnet",
    NEAR_TESTNET_TEST_TOKEN_NAME: "Test Dollar",
    NEAR_TESTNET_TEST_TOKEN_SYMBOL: "TUSD",
    NEAR_TESTNET_TEST_TOKEN_DECIMALS: "6",
  };
  const result = await run(process.execPath, ["scripts/check-testnet.mjs"], {
    env,
  });
  expect(result.stdout).toContain('"contract": "demo-token.testnet"');
  expect(result.stdout).toContain("Test token — no monetary value");
  await expect(
    run(process.execPath, ["scripts/check-testnet.mjs"], {
      env: { ...env, NEAR_TESTNET_TEST_TOKEN_DECIMALS: " " },
    }),
  ).rejects.toThrow();
});

test("an explicitly allowlisted fallback is saved and presented as a test token, never Circle USDC", async () => {
  const headers = {
    authorization: `Bearer ${environment().aliceToken}`,
    "content-type": "application/json",
  };
  const config = await request("/api/merchant", { headers });
  expect(await config.json()).toMatchObject({
    asset: {
      kind: "test-token",
      contract: "demo-token.testnet",
      name: "Test Dollar",
      symbol: "TUSD",
      decimals: 6,
      label: "Test token — no monetary value",
    },
  });
  const saved = await request("/api/merchant", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      displayName: "Demo Studio",
      receivingAccount: "alice.testnet",
      network: "testnet",
      confirmsControl: true,
    }),
  });
  expect(saved.status).toBe(200);
  const persisted = await request("/api/merchant", { headers });
  expect(await persisted.json()).toMatchObject({
    mainnetEnabled: false,
    profile: {
      token_contract_id: "demo-token.testnet",
      asset_symbol: "TUSD",
      asset_kind: "test-token",
    },
  });
});
