export type Asset = {
  kind: "circle-usdc" | "test-token";
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
  label: string;
};
export type MerchantProfile = {
  display_name: string;
  testnet_wallet_id: string;
  token_contract_id: string;
  asset_symbol: string;
  token_decimals: number;
  asset_kind: Asset["kind"];
  checked_at: string;
};
export type MerchantSetup = {
  profile: MerchantProfile | null;
  network: "testnet";
  mainnetEnabled: false;
  asset: Asset;
};
export type StorageGuidance = {
  network: string;
  contract: string;
  method: string;
  args: { account_id: string; registration_only: boolean };
  minimumDepositYocto: string;
};
