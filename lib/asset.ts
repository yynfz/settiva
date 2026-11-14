import { z } from "zod";
import type { Asset } from "./contracts";

export const accountId = z
  .string()
  .min(2)
  .max(64)
  .regex(/^([a-z0-9]+[-_])*[a-z0-9]+(\.([a-z0-9]+[-_])*[a-z0-9]+)*$/);
const circleTestnet =
  "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const forbiddenFallbacks = [
  circleTestnet,
  "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
];

export function configuredAsset(): Asset {
  const selected = process.env.NEAR_TESTNET_ASSET || "circle-usdc";
  if (selected === "circle-usdc") {
    if (
      process.env.NEAR_TESTNET_USDC_CONTRACT &&
      process.env.NEAR_TESTNET_USDC_CONTRACT !== circleTestnet
    )
      throw new Error("The configured USDC contract is not allowlisted.");
    return {
      kind: "circle-usdc",
      contract: circleTestnet,
      name: "USDC",
      symbol: "USDC",
      decimals: 6,
      label: "Circle testnet USDC — no monetary value",
    };
  }
  const contract = accountId.safeParse(
    process.env.NEAR_TESTNET_TEST_TOKEN_CONTRACT,
  );
  const name = process.env.NEAR_TESTNET_TEST_TOKEN_NAME;
  const symbol = process.env.NEAR_TESTNET_TEST_TOKEN_SYMBOL;
  const rawDecimals = process.env.NEAR_TESTNET_TEST_TOKEN_DECIMALS;
  const decimals = rawDecimals?.trim() ? Number(rawDecimals) : NaN;
  if (
    selected !== "test-token" ||
    !contract.success ||
    forbiddenFallbacks.includes(contract.data) ||
    !name ||
    !symbol ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 24
  ) {
    throw new Error("The test token allowlist is incomplete or invalid.");
  }
  return {
    kind: "test-token",
    contract: contract.data,
    name,
    symbol,
    decimals,
    label: "Test token — no monetary value",
  };
}
