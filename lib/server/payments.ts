import "server-only";
import { z } from "zod";
import { database, RequestError } from "./merchant";

import { validateInvoiceAsset } from "./network";
import { explorerUrl } from "../network";
async function networkRpc(network: string, method: string, params: unknown) {
  const endpoint =
    network === "mainnet"
      ? process.env.NEAR_MAINNET_RPC_URL
      : process.env.NEAR_TESTNET_RPC_URL;
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
  validateInvoiceAsset(data);
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
    explorerUrl: explorerUrl(invoice.network, payment.transaction_hash),
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
async function enforceRateLimit(
  db: ReturnType<typeof database>,
  invoiceId: string,
  hash: string,
  sender: string,
) {
  const result = await db.rpc("reserve_verification", {
    p_invoice: invoiceId,
    p_hash: hash,
    p_sender: sender,
  });
  if (result.error) throw result.error;
  if (!result.data)
    throw new RequestError(
      429,
      "rate_limit",
      "Too many verification requests. Retry later; do not send another payment.",
    );
}

async function upsertAttempt(
  db: ReturnType<typeof database>,
  invoiceId: string,
  hash: string,
  sender: string,
  outcome: "pending" | "verified" | "failed" | "mismatch" | "rpc_unavailable",
  errorCode?: string,
) {
  // Insert-or-update: insert first attempt as pending; subsequent calls update outcome.
  const { error } = await db.from("payment_attempts").upsert(
    {
      invoice_id: invoiceId,
      transaction_hash: hash,
      sender_account: sender,
      outcome,
      error_code: errorCode ?? null,
      resolved_at: outcome !== "pending" ? new Date().toISOString() : null,
    },
    { onConflict: "invoice_id,transaction_hash", ignoreDuplicates: false },
  );
  // Log silently — attempt persistence must not block or override a payment error.
  if (error) console.error("[attempt] upsert failed:", error.message);
}

export async function verifyPayment(
  token: string,
  hash: string,
  sender: string,
) {
  const invoice = await paymentInvoice(token);
  const db = database();

  const rpc = (method: string, params: unknown) =>
    networkRpc(invoice.network, method, params);
  // Idempotency: return stable result for already-verified hashes.
  const { data: existing, error } = await db
    .from("verified_payments")
    .select("*")
    .eq("network", invoice.network)
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
    await upsertAttempt(db, invoice.id, hash, sender, "verified");
    return {
      receipt: await appliedReceipt(invoice),
      classification: existing.applied ? "applied" : "overpayment",
    };
  }

  // Rate limit: guard against hash-enumeration spam on new submissions.
  await enforceRateLimit(db, invoice.id, hash, sender);

  // Persist the attempt as pending before hitting the RPC so the payer
  // can find it on page reload even if the connection drops.
  await upsertAttempt(db, invoice.id, hash, sender, "pending");

  let chain: { chain_id: string };
  try {
    chain = await rpc("status", []);
  } catch (err) {
    await upsertAttempt(
      db,
      invoice.id,
      hash,
      sender,
      "rpc_unavailable",
      "rpc_unavailable",
    );
    throw err;
  }

  if (chain.chain_id !== invoice.network) {
    await upsertAttempt(
      db,
      invoice.id,
      hash,
      sender,
      "rpc_unavailable",
      "wrong_network",
    );
    throw new RequestError(
      503,
      "wrong_network",
      "Verification RPC does not match the invoice network.",
    );
  }

  let raw: unknown;
  try {
    raw = await rpc("tx", {
      tx_hash: hash,
      sender_account_id: sender,
      wait_until: "FINAL",
    });
  } catch (err) {
    await upsertAttempt(
      db,
      invoice.id,
      hash,
      sender,
      "rpc_unavailable",
      "rpc_unavailable",
    );
    throw err;
  }

  // Record execution state separately from mismatched payment terms.
  const executionState = z
    .object({
      final_execution_status: z.string(),
      transaction: z.object({
        hash: z.literal(hash),
        signer_id: z.literal(sender),
      }),
      status: z.unknown(),
    })
    .safeParse(raw);
  if (
    executionState.success &&
    executionState.data.final_execution_status !== "FINAL"
  ) {
    await upsertAttempt(
      db,
      invoice.id,
      hash,
      sender,
      "pending",
      "pending_confirmation",
    );
    throw new RequestError(
      422,
      "pending_confirmation",
      "Transfer is awaiting final confirmation. Retry verification.",
    );
  }
  if (
    executionState.success &&
    z
      .object({ Failure: z.unknown() })
      .refine((value) => "Failure" in value)
      .safeParse(executionState.data.status).success
  ) {
    await upsertAttempt(
      db,
      invoice.id,
      hash,
      sender,
      "failed",
      "execution_failed",
    );
    throw new RequestError(
      422,
      "execution_failed",
      "The transfer failed onchain.",
    );
  }
  const parsed = evidenceSchema.safeParse(raw);
  const mismatch = async (code?: string) => {
    await upsertAttempt(
      db,
      invoice.id,
      hash,
      sender,
      "mismatch",
      code ?? "payment_mismatch",
    );
    return new RequestError(
      422,
      "payment_mismatch",
      "No finalized, successful transfer matching this invoice was verified.",
    );
  };

  if (!parsed.success) throw await mismatch();
  const tx = parsed.data.transaction;
  if (
    tx.hash !== hash ||
    tx.signer_id !== sender ||
    tx.receiver_id !== invoice.token_contract_id
  )
    throw await mismatch();

  let args: unknown;
  try {
    args = JSON.parse(
      Buffer.from(tx.actions[0].FunctionCall.args, "base64").toString("utf8"),
    );
  } catch {
    throw await mismatch();
  }
  const expected = z
    .object({
      receiver_id: z.literal(invoice.receiving_account),
      amount: z.literal(invoice.amount_atomic),
      memo: z.literal(invoice.payment_reference),
    })
    .strict();
  if (!expected.safeParse(args).success) throw await mismatch("wrong_args");

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
    throw await mismatch("receipt_failure");

  let block: { header: { hash: string; timestamp_nanosec: string } };
  try {
    block = z
      .object({
        header: z.object({
          hash: z.literal(execution.block_hash),
          timestamp_nanosec: z.string().regex(/^\d+$/),
        }),
      })
      .parse(await rpc("block", { block_id: execution.block_hash }));
  } catch (err) {
    if (err instanceof RequestError) {
      await upsertAttempt(
        db,
        invoice.id,
        hash,
        sender,
        "rpc_unavailable",
        "rpc_unavailable",
      );
      throw err;
    }
    throw await mismatch("block_unavailable");
  }

  const timestamp = new Date(
    Number(BigInt(block.header.timestamp_nanosec) / 1000000n),
  ).toISOString();
  if (new Date(timestamp).getTime() < new Date(invoice.created_at).getTime())
    throw await mismatch("predates_invoice");
  const saved = await db.rpc("record_verified_payment", {
    p_invoice: invoice.id,
    p_hash: hash,
    p_sender: sender,
    p_block: execution.block_hash,
    p_timestamp: timestamp,
  });
  if (saved.error) throw saved.error;
  await upsertAttempt(db, invoice.id, hash, sender, "verified");
  return {
    receipt: await appliedReceipt(invoice),
    classification: saved.data.applied ? "applied" : "overpayment",
  };
}
export type PaymentReceipt = NonNullable<
  Awaited<ReturnType<typeof appliedReceipt>>
>;

import type { Overpayment } from "@/lib/contracts";

function formatOverpayment(payment: any, invoice: any): Overpayment {
  return {
    id: payment.id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    network: invoice.network,
    transactionHash: payment.transaction_hash,
    senderAccount: payment.sender_account,
    receivingAccount: invoice.receiving_account,
    amountAtomic: invoice.amount_atomic,
    amountDisplay: invoice.amount_display,
    assetSymbol: invoice.asset_symbol,
    tokenContract: invoice.token_contract_id,
    verifiedAt: payment.verified_at,
    refundStatus: payment.refund_status || "refund_needed",
    refundHash: payment.refund_hash || null,
    refundTimestamp: payment.refund_timestamp
      ? new Date(payment.refund_timestamp).toISOString()
      : null,
    explorerUrl: explorerUrl(invoice.network, payment.transaction_hash),
    refundExplorerUrl: payment.refund_hash
      ? explorerUrl(invoice.network, payment.refund_hash)
      : null,
  };
}

export async function listOverpaymentsForInvoice(
  invoiceId: string,
  merchantId: string,
): Promise<Overpayment[]> {
  const db = database();
  const { data: inv, error: invErr } = await db
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (invErr || !inv)
    throw new RequestError(404, "invoice_not_found", "Invoice not found");

  const { data: payments, error: payErr } = await db
    .from("verified_payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .eq("applied", false)
    .order("verified_at", { ascending: false });
  if (payErr) throw payErr;
  return (payments || []).map((p) => formatOverpayment(p, inv));
}

export async function getOverpaymentById(
  paymentId: string,
  merchantId?: string,
): Promise<Overpayment> {
  const db = database();
  const { data: payment, error: payErr } = await db
    .from("verified_payments")
    .select("*, invoices(*)")
    .eq("id", paymentId)
    .maybeSingle();
  if (payErr || !payment)
    throw new RequestError(
      404,
      "payment_not_found",
      "Payment record not found",
    );
  if (payment.applied)
    throw new RequestError(
      400,
      "not_an_overpayment",
      "Applied payments cannot be refunded",
    );
  const invoice = payment.invoices;
  if (!invoice)
    throw new RequestError(
      404,
      "invoice_not_found",
      "Associated invoice not found",
    );
  if (merchantId && invoice.merchant_id !== merchantId) {
    throw new RequestError(
      404,
      "payment_not_found",
      "Payment record not found",
    );
  }
  return formatOverpayment(payment, invoice);
}

export async function verifyRefund(
  paymentId: string,
  merchantId: string,
  refundHash: string,
): Promise<Overpayment> {
  const db = database();
  const { data: payment, error: payErr } = await db
    .from("verified_payments")
    .select("*, invoices(*)")
    .eq("id", paymentId)
    .maybeSingle();
  if (payErr || !payment)
    throw new RequestError(
      404,
      "payment_not_found",
      "Payment record not found",
    );
  if (payment.applied)
    throw new RequestError(
      400,
      "not_an_overpayment",
      "Applied payments cannot be refunded",
    );
  const invoice = payment.invoices;
  if (!invoice || invoice.merchant_id !== merchantId) {
    throw new RequestError(
      404,
      "payment_not_found",
      "Payment record not found",
    );
  }

  // Idempotency: if already refunded with the same hash, return existing result
  if (payment.refund_status === "refunded") {
    if (payment.refund_hash === refundHash) {
      return formatOverpayment(payment, invoice);
    }
    throw new RequestError(
      409,
      "already_refunded",
      "This overpayment was already refunded with a different transaction.",
    );
  }

  // Verify return transaction on NEAR RPC
  validateInvoiceAsset(invoice);
  const rpc = (method: string, params: unknown) =>
    networkRpc(invoice.network, method, params);
  const chain = await rpc("status", []);
  if (chain.chain_id !== invoice.network) {
    throw new RequestError(
      503,
      "wrong_network",
      "Verification RPC does not match the invoice network.",
    );
  }

  const raw = await rpc("tx", {
    tx_hash: refundHash,
    sender_account_id: invoice.receiving_account,
    wait_until: "FINAL",
  });

  const mismatch = (
    msg = "No finalized return transfer matching this refund was verified.",
  ) => new RequestError(422, "refund_mismatch", msg);

  const parsed = evidenceSchema.safeParse(raw);
  if (!parsed.success) throw mismatch();

  const tx = parsed.data.transaction;
  // The refund MUST be sent from the merchant's receiving account
  if (
    tx.hash !== refundHash ||
    tx.signer_id !== invoice.receiving_account ||
    tx.receiver_id !== invoice.token_contract_id
  ) {
    throw mismatch(
      "Transaction does not match merchant sender or token contract.",
    );
  }

  let args: any;
  try {
    args = JSON.parse(
      Buffer.from(tx.actions[0].FunctionCall.args, "base64").toString("utf8"),
    );
  } catch {
    throw mismatch();
  }

  // The refund recipient MUST be the original overpayment sender
  if (args.receiver_id !== payment.sender_account) {
    throw mismatch("Refund recipient does not match original payer.");
  }
  // The refund amount MUST be the full invoice amount
  if (args.amount !== invoice.amount_atomic) {
    throw mismatch("Refund amount does not match overpayment amount.");
  }

  const execution = parsed.data.receipts_outcome.find(
    (item) =>
      item.id ===
      parsed.data.transaction_outcome.outcome.status.SuccessReceiptId,
  );
  if (
    !execution ||
    execution.outcome.executor_id !== invoice.token_contract_id ||
    !("SuccessValue" in execution.outcome.status)
  ) {
    throw mismatch("Return transfer execution failed.");
  }

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

  if (
    refundHash === payment.transaction_hash ||
    new Date(timestamp).getTime() < new Date(payment.block_timestamp).getTime()
  )
    throw mismatch(
      "Return transfer predates the overpayment or reuses its transaction.",
    );
  const saved = await db.rpc("record_verified_refund", {
    p_payment_id: payment.id,
    p_refund_hash: refundHash,
    p_refund_block: execution.block_hash,
    p_refund_timestamp: timestamp,
  });
  if (saved.error) throw saved.error;

  return formatOverpayment(saved.data, invoice);
}

// A public lookup projects only evidence for the exact invoice/hash pair.
export async function lookupTransfer(token: string, hash: string) {
  const invoice = await paymentInvoice(token);
  const db = database();
  const limit = await db.rpc("consume_lookup", { p_invoice: invoice.id });
  if (limit.error) throw limit.error;
  if (!limit.data)
    throw new RequestError(
      429,
      "lookup_rate_limit",
      "Too many lookups for this invoice. Try again in a minute.",
    );
  const payment = await db
    .from("verified_payments")
    .select("*")
    .eq("invoice_id", invoice.id)
    .eq("transaction_hash", hash)
    .maybeSingle();
  if (payment.error) throw payment.error;
  if (payment.data) {
    const p = payment.data;
    return {
      status: "verified",
      transactionHash: hash,
      classification: p.applied ? "applied" : "overpayment",
      details: receipt(invoice, p),
      refundStatus: p.applied ? null : p.refund_status || "refund_needed",
      refund:
        p.refund_status === "refunded"
          ? {
              transactionHash: p.refund_hash,
              blockTimestamp: p.refund_timestamp,
              explorerUrl: explorerUrl(invoice.network, p.refund_hash),
            }
          : null,
    };
  }
  const attempt = await db
    .from("payment_attempts")
    .select("outcome,error_code")
    .eq("invoice_id", invoice.id)
    .eq("transaction_hash", hash)
    .maybeSingle();
  if (attempt.error) throw attempt.error;
  if (!attempt.data)
    throw new RequestError(
      404,
      "transfer_not_found",
      "No recorded transfer with this hash for this invoice.",
    );
  return {
    status: attempt.data.outcome,
    transactionHash: hash,
    errorCode: attempt.data.error_code,
    classification: null,
  };
}
