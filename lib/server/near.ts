import "server-only";
import { z } from "zod";
import { RequestError } from "./merchant";

import type { Asset } from "../contracts";
import { accountId, configuredAsset } from "../asset";
export { accountId, configuredAsset };

async function rpc(method: string, params: unknown) {
  const endpoint = process.env.NEAR_TESTNET_RPC_URL;
  if (!endpoint)
    throw new RequestError(
      503,
      "configuration",
      "The testnet RPC is not configured.",
    );
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "settiva", method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new RequestError(
      503,
      "rpc_unavailable",
      "Testnet checks are temporarily unavailable. Try again; no account was saved.",
    );
  }
  if (!response.ok)
    throw new RequestError(
      503,
      "rpc_unavailable",
      "Testnet checks are temporarily unavailable. Try again.",
    );
  const data = z
    .object({ result: z.unknown().optional(), error: z.unknown().optional() })
    .parse(await response.json());
  if (data.error) {
    const cause = z
      .object({ cause: z.object({ name: z.string() }).optional() })
      .safeParse(data.error);
    if (cause.success && cause.data.cause?.name === "UNKNOWN_ACCOUNT")
      throw new RequestError(
        422,
        "account_missing",
        "This account does not exist on NEAR testnet. Check the account and network.",
      );
    throw new RequestError(
      503,
      "rpc_unavailable",
      "The token contract could not be checked. Try again later.",
    );
  }
  return data.result;
}
async function view(asset: Asset, method: string, args: unknown = {}) {
  const result = z
    .object({ result: z.array(z.number().int().min(0).max(255)).max(100_000) })
    .parse(
      await rpc("query", {
        request_type: "call_function",
        finality: "final",
        account_id: asset.contract,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      }),
    );
  return JSON.parse(Buffer.from(result.result).toString());
}
const atomic = z.string().regex(/^\d+$/);
export async function checkReceivingAccount(receivingAccount: string) {
  const asset = configuredAsset();
  const chain = z
    .object({ chain_id: z.string() })
    .parse(await rpc("status", []));
  if (chain.chain_id !== "testnet")
    throw new RequestError(
      503,
      "wrong_network",
      "The configured RPC is not NEAR testnet. Contact the operator.",
    );
  const [account, rawMetadata] = await Promise.all([
    rpc("query", {
      request_type: "view_account",
      finality: "final",
      account_id: receivingAccount,
    }),
    view(asset, "ft_metadata"),
  ]);
  const nearBalance = z.object({ amount: atomic }).parse(account).amount;
  const metadata = z
    .object({
      spec: z.literal("ft-1.0.0"),
      name: z.literal(asset.name),
      symbol: z.literal(asset.symbol),
      decimals: z.literal(asset.decimals),
    })
    .safeParse(rawMetadata);
  if (!metadata.success)
    throw new RequestError(
      422,
      "token_metadata_mismatch",
      "Token metadata does not match the server allowlist. No account was saved.",
    );
  const [rawStorage, rawBalance] = await Promise.all([
    view(asset, "storage_balance_of", { account_id: receivingAccount }),
    view(asset, "ft_balance_of", { account_id: receivingAccount }),
  ]);
  const storage = z
    .object({ total: atomic, available: atomic })
    .nullable()
    .parse(rawStorage);
  const tokenBalanceAtomic = atomic.parse(rawBalance);
  if (!storage || BigInt(storage.total) === 0n) {
    const bounds = z
      .object({ min: atomic })
      .parse(await view(asset, "storage_balance_bounds"));
    throw new RequestError(
      409,
      "storage_required",
      "Register this receiving account with the token contract in your wallet, then check again. A separate wallet approval and NEAR deposit are required.",
      {
        network: "testnet",
        contract: asset.contract,
        method: "storage_deposit",
        args: { account_id: receivingAccount, registration_only: true },
        minimumDepositYocto: bounds.min,
      },
    );
  }
  return {
    asset,
    tokenBalanceAtomic,
    nearBalanceYocto: nearBalance,
    checkedAt: new Date().toISOString(),
  };
}
