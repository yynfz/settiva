import { expect } from "vitest";
import { environment, request } from "./context";
export async function issuedInvoice() {
  const headers = {
    authorization: `Bearer ${environment().aliceToken}`,
    "content-type": "application/json",
  };
  expect(
    (
      await request("/api/merchant", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          displayName: "Alice Studio",
          receivingAccount: "alice.testnet",
          network: "testnet",
          confirmsControl: true,
        }),
      })
    ).status,
  ).toBe(200);
  const result = await request("/api/invoices", {
    method: "POST",
    headers,
    body: JSON.stringify({
      clientLabel: "Private client",
      items: [{ description: "Design", quantity: 1, unitPrice: "12.50" }],
    }),
  });
  expect(result.status).toBe(201);
  return (await result.json()).invoice;
}

export const hash = "A".repeat(44);
export async function evidence(
  invoice: any,
  overrides: Record<string, unknown> = {},
) {
  const value = {
    final_execution_status: "FINAL",
    status: { SuccessValue: "" },
    transaction: {
      hash,
      signer_id: "payer.testnet",
      receiver_id: invoice.token_contract_id,
      actions: [
        {
          FunctionCall: {
            method_name: "ft_transfer",
            deposit: "1",
            gas: 30000000000000,
            args: Buffer.from(
              JSON.stringify({
                receiver_id: "alice.testnet",
                amount: "12500000",
                memo: invoice.payment_reference,
              }),
            ).toString("base64"),
          },
        },
      ],
    },
    transaction_outcome: {
      outcome: { status: { SuccessReceiptId: "transfer-receipt" } },
    },
    receipts_outcome: [
      {
        id: "transfer-receipt",
        block_hash: "settlement-block",
        outcome: {
          executor_id: invoice.token_contract_id,
          status: { SuccessValue: "" },
          logs: [],
        },
      },
    ],
    ...overrides,
  };
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify(value),
  });
  return value;
}
export function verify(token: string, transactionHash = hash) {
  return request(`/api/portal/${token}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactionHash, senderAccount: "payer.testnet" }),
  });
}
