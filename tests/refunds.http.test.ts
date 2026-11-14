import { afterEach, beforeEach, expect, test } from "vitest";
import { environment, request } from "./support/context";
import {
  issuedInvoice,
  evidence,
  hash,
  verify,
} from "./support/payment-fixture";

beforeEach(async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
});

afterEach(async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
});

const secondHash = "B".repeat(44);
const refundHash = "C".repeat(44);

async function refundEvidence(
  invoice: any,
  payerAccount: string,
  txHash = refundHash,
  overrides: Record<string, unknown> = {},
) {
  const value = {
    final_execution_status: "FINAL",
    status: { SuccessValue: "" },
    transaction: {
      hash: txHash,
      signer_id: "alice.testnet",
      receiver_id: invoice.token_contract_id,
      actions: [
        {
          FunctionCall: {
            method_name: "ft_transfer",
            deposit: "1",
            gas: 30000000000000,
            args: Buffer.from(
              JSON.stringify({
                receiver_id: payerAccount,
                amount: invoice.amount_atomic,
                memo: "Refund for overpayment",
              }),
            ).toString("base64"),
          },
        },
      ],
    },
    transaction_outcome: {
      outcome: { status: { SuccessReceiptId: "refund-receipt" } },
    },
    receipts_outcome: [
      {
        id: "refund-receipt",
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

test("duplicate payment records overpayment with refund_needed and merchant can list overpayments", async () => {
  const invoice = await issuedInvoice();
  await evidence(invoice);
  // 1. First payment applies and marks paid
  const first = await (await verify(invoice.access_token)).json();
  expect(first.classification).toBe("applied");

  // 2. Second matching payment records as overpayment
  const secondEvidence = await evidence(invoice);
  secondEvidence.transaction.hash = secondHash;
  secondEvidence.transaction.signer_id = "payer2.testnet";
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify(secondEvidence),
  });

  const second = await (
    await request(`/api/portal/${invoice.access_token}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transactionHash: secondHash,
        senderAccount: "payer2.testnet",
      }),
    })
  ).json();

  expect(second.classification).toBe("overpayment");
  expect(second.receipt).toEqual(first.receipt); // Original receipt remains intact

  // 3. Merchant lists overpayments for invoice
  const aliceHeaders = { authorization: `Bearer ${environment().aliceToken}` };
  const res = await request(`/api/invoices/${invoice.id}/overpayments`, {
    headers: aliceHeaders,
  });
  expect(res.status).toBe(200);
  const { overpayments } = await res.json();
  expect(overpayments).toHaveLength(1);
  expect(overpayments[0]).toMatchObject({
    transactionHash: secondHash,
    senderAccount: "payer2.testnet",
    receivingAccount: "alice.testnet",
    refundStatus: "refund_needed",
    refundHash: null,
  });

  // 4. Bob cannot list Alice's invoice overpayments
  const bobHeaders = { authorization: `Bearer ${environment().bobToken}` };
  const bobRes = await request(`/api/invoices/${invoice.id}/overpayments`, {
    headers: bobHeaders,
  });
  expect(bobRes.status).toBe(404);
});

test("merchant verifies onchain refund and downloads Credit Note PDF", async () => {
  const invoice = await issuedInvoice();
  await evidence(invoice);
  await verify(invoice.access_token);

  // Record overpayment from payer2.testnet
  const secondEvidence = await evidence(invoice);
  secondEvidence.transaction.hash = secondHash;
  secondEvidence.transaction.signer_id = "payer2.testnet";
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify(secondEvidence),
  });
  await request(`/api/portal/${invoice.access_token}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactionHash: secondHash,
      senderAccount: "payer2.testnet",
    }),
  });

  const aliceHeaders = {
    authorization: `Bearer ${environment().aliceToken}`,
    "content-type": "application/json",
  };
  const { overpayments } = await (
    await request(`/api/invoices/${invoice.id}/overpayments`, {
      headers: aliceHeaders,
    })
  ).json();
  const overpaymentId = overpayments[0].id;

  // Mock valid refund transaction evidence on testnet RPC
  await refundEvidence(invoice, "payer2.testnet", refundHash);

  // Submit refund verification
  const refundRes = await request(`/api/payments/${overpaymentId}/refund`, {
    method: "POST",
    headers: aliceHeaders,
    body: JSON.stringify({ refundHash }),
  });
  expect(refundRes.status).toBe(200);
  const refundData = await refundRes.json();
  expect(refundData.overpayment).toMatchObject({
    id: overpaymentId,
    refundStatus: "refunded",
    refundHash,
  });

  // Idempotency: re-submitting the same refund hash returns the existing result
  const repeated = await request(`/api/payments/${overpaymentId}/refund`, {
    method: "POST",
    headers: aliceHeaders,
    body: JSON.stringify({ refundHash }),
  });
  expect(repeated.status).toBe(200);

  // Download Credit Note PDF
  const pdfRes = await request(`/api/payments/${overpaymentId}/refund/pdf`, {
    headers: { authorization: `Bearer ${environment().aliceToken}` },
  });
  expect(pdfRes.status).toBe(200);
  expect(pdfRes.headers.get("content-type")).toBe("application/pdf");
  const text = Buffer.from(await pdfRes.arrayBuffer()).toString("latin1");
  expect(text).toContain("%PDF-1.4");
  expect(text).toContain("CREDIT NOTE");
  expect(text).toContain(refundHash);
  expect(text).toContain("payer2.testnet");
});

test("invalid refund attempts are rejected with 422 and do not alter status", async () => {
  const invoice = await issuedInvoice();
  await evidence(invoice);
  await verify(invoice.access_token);

  const secondEvidence = await evidence(invoice);
  secondEvidence.transaction.hash = secondHash;
  secondEvidence.transaction.signer_id = "payer2.testnet";
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify(secondEvidence),
  });
  await request(`/api/portal/${invoice.access_token}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactionHash: secondHash,
      senderAccount: "payer2.testnet",
    }),
  });

  const aliceHeaders = {
    authorization: `Bearer ${environment().aliceToken}`,
    "content-type": "application/json",
  };
  const { overpayments } = await (
    await request(`/api/invoices/${invoice.id}/overpayments`, {
      headers: aliceHeaders,
    })
  ).json();
  const overpaymentId = overpayments[0].id;

  // 1. Wrong recipient (refund sent to someone else)
  await refundEvidence(invoice, "wrong-recipient.testnet", refundHash);
  const wrongRecip = await request(`/api/payments/${overpaymentId}/refund`, {
    method: "POST",
    headers: aliceHeaders,
    body: JSON.stringify({ refundHash }),
  });
  expect(wrongRecip.status).toBe(422);

  // Status remains refund_needed
  const check = await (
    await request(`/api/invoices/${invoice.id}/overpayments`, {
      headers: aliceHeaders,
    })
  ).json();
  expect(check.overpayments[0].refundStatus).toBe("refund_needed");

  // 2. Bob cannot submit refund for Alice's overpayment
  const bobHeaders = {
    authorization: `Bearer ${environment().bobToken}`,
    "content-type": "application/json",
  };
  const bobRefund = await request(`/api/payments/${overpaymentId}/refund`, {
    method: "POST",
    headers: bobHeaders,
    body: JSON.stringify({ refundHash }),
  });
  expect(bobRefund.status).toBe(404);
});
