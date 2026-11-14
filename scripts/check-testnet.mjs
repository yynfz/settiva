// Read-only RPC checks. This command never creates accounts or submits transactions.
import { configuredAsset } from "../lib/asset.ts";

const rpcUrl = process.env.NEAR_TESTNET_RPC_URL;
const asset = configuredAsset();
const contract = asset.contract;
const account = process.argv[2];
if (!rpcUrl) throw new Error("Set NEAR_TESTNET_RPC_URL.");
async function rpc(method, params = {}) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "settiva-read-only",
      method,
      params,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const data = await response.json();
  if (data.error)
    throw new Error(
      `RPC rejected query: ${data.error.cause?.name || data.error.name || "unknown error"}`,
    );
  return data.result;
}
async function view(method, args = {}) {
  const result = await rpc("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(result.result).toString());
}
const status = await rpc("status");
if (status.chain_id !== "testnet") throw new Error("RPC is not NEAR testnet.");
const { spec, name, symbol, decimals } = await view("ft_metadata");
if (
  spec !== "ft-1.0.0" ||
  name !== asset.name ||
  symbol !== asset.symbol ||
  decimals !== asset.decimals
)
  throw new Error("Token metadata does not match the configured asset.");
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      network: status.chain_id,
      contract,
      assetLabel: asset.label,
      metadata: { spec, name, symbol, decimals },
      storageBounds: await view("storage_balance_bounds"),
    },
    null,
    2,
  ),
);
if (account) {
  console.log(
    JSON.stringify(
      {
        account,
        accountState: await rpc("query", {
          request_type: "view_account",
          finality: "final",
          account_id: account,
        }),
        storage: await view("storage_balance_of", { account_id: account }),
        balanceAtomic: await view("ft_balance_of", { account_id: account }),
      },
      null,
      2,
    ),
  );
} else
  console.log(
    "No receiving account supplied. Storage registration and funded-wallet proof remain unverified.",
  );
