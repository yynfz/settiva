import { z } from "zod";
import {
  database,
  failure,
  RequestError,
  requireMerchant,
  respond,
} from "../../../lib/server/merchant";
import {
  accountId,
  checkReceivingAccount,
  configuredAsset,
} from "../../../lib/server/near";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { client, userId } = await requireMerchant(request);
    const result = await client
      .from("merchant_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (result.error) throw result.error;
    return respond({
      profile: result.data,
      network: "testnet",
      mainnetEnabled: false,
      asset: configuredAsset(),
    });
  } catch (error) {
    return failure(error);
  }
}
const setup = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    receivingAccount: accountId,
    network: z.literal("testnet"),
    confirmsControl: z.literal(true),
  })
  .strict();
export async function PUT(request: Request) {
  try {
    const { userId } = await requireMerchant(request);
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new RequestError(
        400,
        "invalid_request",
        "Send valid account details.",
      );
    }
    const parsed = setup.safeParse(input);
    if (!parsed.success)
      throw new RequestError(
        400,
        "invalid_request",
        "Enter a display name and valid testnet account, and confirm that you control it. Mainnet is unavailable.",
      );
    const { displayName, receivingAccount } = parsed.data;
    const checked = await checkReceivingAccount(receivingAccount);
    const saved = await database()
      .from("merchant_profiles")
      .upsert(
        {
          user_id: userId,
          display_name: displayName,
          testnet_wallet_id: receivingAccount,
          token_contract_id: checked.asset.contract,
          asset_symbol: checked.asset.symbol,
          token_decimals: checked.asset.decimals,
          asset_kind: checked.asset.kind,
          control_confirmed_at: checked.checkedAt,
          checked_at: checked.checkedAt,
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();
    if (saved.error) throw saved.error;
    return respond({
      profile: saved.data,
      network: "testnet",
      mainnetEnabled: false,
      ...checked,
    });
  } catch (error) {
    return failure(error);
  }
}
