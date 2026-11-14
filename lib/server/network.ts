import "server-only";
import { mainnetUsdc, networkBadge } from "../network";
import type { Asset } from "../contracts";
import { RequestError } from "./merchant";
export function networkPolicy(network: string) {
  if (network !== "mainnet" && network !== "testnet")
    throw new RequestError(
      422,
      "unsupported_network",
      "Unsupported invoice network.",
    );
  const checkoutEnabled =
    network === "testnet" || process.env.ENABLE_MAINNET_PAYMENTS === "true";
  if (network === "mainnet") mainnetAsset();
  return {
    network,
    checkoutEnabled,
    badge: networkBadge(network, checkoutEnabled),
  };
}
export function validateInvoiceAsset(invoice: {
  network: string;
  asset_kind: string;
  token_contract_id: string;
  token_decimals: number;
  asset_symbol: string;
}) {
  networkPolicy(invoice.network);
  if (invoice.network === "mainnet") {
    const asset = mainnetAsset();
    if (
      invoice.asset_kind !== asset.kind ||
      invoice.token_contract_id !== asset.contract ||
      invoice.token_decimals !== asset.decimals ||
      invoice.asset_symbol !== asset.symbol
    )
      throw new RequestError(
        422,
        "unsupported_asset",
        "Mainnet requires allowlisted native USDC.",
      );
  }
}

export function mainnetAsset(): Asset {
  if (
    process.env.NEAR_MAINNET_USDC_CONTRACT &&
    process.env.NEAR_MAINNET_USDC_CONTRACT !== mainnetUsdc
  )
    throw new Error("Mainnet USDC contract is not allowlisted.");
  return {
    kind: "circle-usdc",
    contract: mainnetUsdc,
    name: "USDC",
    symbol: "USDC",
    decimals: 6,
    label: "Circle native USDC · Mainnet",
  };
}
