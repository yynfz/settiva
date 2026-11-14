import "server-only";
import { z } from "zod";
import { database, RequestError } from "./merchant";

async function rpc(method: string, params: unknown) {
  const endpoint = process.env.NEAR_TESTNET_RPC_URL;
  if (!endpoint)
    throw new RequestError(
      503,
      "rpc_unavailable",
      "Testnet verification is unavailable.",
    );
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "settlement",
        method,
        params,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const body = await response.json();
    if (!response.ok || body.error || !body.result)
      throw new Error("Unavailable");
    return body.result;
  } catch {
    throw new RequestError(
      503,
      "verification_unavailable",
      "Could not confirm this transfer. Retry verification; do not send another payment.",
    );
  }
}
export async function paymentInvoice(token: string) {
  const { data, error } = await database()
    .from("invoices")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();
  if (error || !data)
    throw new RequestError(404, "invoice_not_found", "Invoice not found.");
  if (data.network !== "testnet")
    throw new RequestError(
      403,
      "mainnet_disabled",
      "Mainnet payments are unavailable.",
    );
  return data;
}
function receipt(
  invoice: Awaited<ReturnType<typeof paymentInvoice>>,
  payment: {
    transaction_hash: string;
    sender_account: string;
    block_hash: string;
    block_timestamp: string;
    verified_at: string;
  },
) {
  return {
    invoiceNumber: invoice.invoice_number,
    transactionHash: payment.transaction_hash,
    senderAccount: payment.sender_account,
    receivingAccount: invoice.receiving_account,
    amountAtomic: invoice.amount_atomic,
    amountDisplay: invoice.amount_display,
    assetSymbol: invoice.asset_symbol,
    assetKind: invoice.asset_kind,
    tokenContract: invoice.token_contract_id,
    network: invoice.network,
    paymentReference: invoice.payment_reference,
    blockHash: payment.block_hash,
    blockTimestamp: new Date(payment.block_timestamp).toISOString(),
    verifiedAt: payment.verified_at,
    explorerUrl: `https://testnet.nearblocks.io/txns/${payment.transaction_hash}`,
  };
}
export async function appliedReceipt(
  invoice: Awaited<ReturnType<typeof paymentInvoice>>,
) {
  const { data, error } = await database()
    .from("verified_payments")
    .select("*")
    .eq("invoice_id", invoice.id)
    .eq("applied", true)
    .maybeSingle();
  if (error) throw error;
  return data ? receipt(invoice, data) : null;
}
const outcomeStatus = z.union([
  z.object({ SuccessValue: z.string() }).strict(),
  z.object({ SuccessReceiptId: z.string() }).strict(),
]);
const evidenceSchema = z.object({
  final_execution_status: z.literal("FINAL"),
  status: z.object({ SuccessValue: z.string() }).strict(),
  transaction: z.object({
    hash: z.string(),
    signer_id: z.string(),
    receiver_id: z.string(),
    actions: z
      .array(
        z
          .object({
            FunctionCall: z.object({
              method_name: z.literal("ft_transfer"),
              deposit: z.literal("1"),
              args: z.string(),
            }),
          })
          .strict(),
      )
      .length(1),
  }),
  transaction_outcome: z.object({
    outcome: z.object({
      status: z.object({ SuccessReceiptId: z.string() }).strict(),
    }),
  }),
  receipts_outcome: z
    .array(
      z.object({
        id: z.string(),
        block_hash: z.string(),
        outcome: z.object({ executor_id: z.string(), status: outcomeStatus }),
      }),
    )
    .min(1),
});
export async function verifyPayment(
  token: string,
  hash: string,
  sender: string,
) {
  const invoice = await paymentInvoice(token);
  const db = database();
  const { data: existing, error } = await db
    .from("verified_payments")
    .select("*")
    .eq("network", "testnet")
    .eq("transaction_hash", hash)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    if (
      existing.invoice_id !== invoice.id ||
      existing.sender_account !== sender
    )
      throw new RequestError(
        422,
        "payment_mismatch",
        "Transfer does not match this invoice and sender.",
      );
    return {
      receipt: await appliedReceipt(invoice),
      classification: existing.applied ? "applied" : "overpayment",
    };
  }
  const chain = await rpc("status", []);
  if (chain.chain_id !== "testnet")
    throw new RequestError(
      503,
      "wrong_network",
      "Verification RPC is not testnet.",
    );
  const raw = await rpc("tx", {
    tx_hash: hash,
    sender_account_id: sender,
    wait_until: "FINAL",
  });
  const parsed = evidenceSchema.safeParse(raw);
  const mismatch = () =>
    new RequestError(
      422,
      "payment_mismatch",
      "No finalized, successful transfer matching this invoice was verified.",
    );
  if (!parsed.success) throw mismatch();
  const tx = parsed.data.transaction;
  if (
    tx.hash !== hash ||
    tx.signer_id !== sender ||
    tx.receiver_id !== invoice.token_contract_id
  )
    throw mismatch();
  let args: unknown;
  try {
    args = JSON.parse(
      Buffer.from(tx.actions[0].FunctionCall.args, "base64").toString("utf8"),
    );
  } catch {
    throw mismatch();
  }
  const expected = z
    .object({
      receiver_id: z.literal(invoice.receiving_account),
      amount: z.literal(invoice.amount_atomic),
      memo: z.literal(invoice.payment_reference),
    })
    .strict();
  if (!expected.safeParse(args).success) throw mismatch();
  const execution = parsed.data.receipts_outcome.find(
    (item) =>
      item.id ===
      parsed.data.transaction_outcome.outcome.status.SuccessReceiptId,
  );
  if (
    !execution ||
    execution.outcome.executor_id !== invoice.token_contract_id ||
    !("SuccessValue" in execution.outcome.status)
  )
    throw mismatch();
  const block = z
    .object({
      header: z.object({
        hash: z.literal(execution.block_hash),
        timestamp_nanosec: z.string().regex(/^\d+$/),
      }),
    })
    .parse(await rpc("block", { block_id: execution.block_hash }));
  const timestamp = new Date(
    Number(BigInt(block.header.timestamp_nanosec) / 1000000n),
  ).toISOString();
  const saved = await db.rpc("record_verified_payment", {
    p_invoice: invoice.id,
    p_hash: hash,
    p_sender: sender,
    p_block: execution.block_hash,
    p_timestamp: timestamp,
  });
  if (saved.error) throw saved.error;
  return {
    receipt: await appliedReceipt(invoice),
    classification: saved.data.applied ? "applied" : "overpayment",
  };
}
export type PaymentReceipt = NonNullable<
  Awaited<ReturnType<typeof appliedReceipt>>
>;
