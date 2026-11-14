export type Network = "testnet" | "mainnet";
export const mainnetUsdc =
  "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
export function networkBadge(network: string, enabled = false) {
  return network === "testnet"
    ? "TESTNET DEMO"
    : enabled
      ? "MAINNET LIMITED DEMO"
      : "DISABLED";
}
export function explorerUrl(network: string, hash: string) {
  return `https://${network === "testnet" ? "testnet." : ""}nearblocks.io/txns/${hash}`;
}
