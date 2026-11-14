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

test("verification accepts only a transaction hash and claimed sender, never client payment terms", async () => {
  const invoice = await issuedInvoice();
  const response = await request(`/api/portal/${invoice.access_token}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactionHash: "A".repeat(44),
      senderAccount: "payer.testnet",
      amount: "1",
    }),
  });
  expect(response.status).toBe(400);
});

test("a final matching transfer pays the invoice and repeated verification returns its stable receipt", async () => {
  const invoice = await issuedInvoice();
  await evidence(invoice);
  const response = await verify(invoice.access_token);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.receipt).toMatchObject({
    transactionHash: hash,
    senderAccount: "payer.testnet",
    receivingAccount: "alice.testnet",
    amountAtomic: "12500000",
    blockTimestamp: "2026-11-14T01:00:00.000Z",
  });
  expect(await (await verify(invoice.access_token)).json()).toEqual(result);
  expect(
    (await (await request(`/api/portal/${invoice.access_token}`)).json())
      .invoice.status,
  ).toBe("paid");
});

test.each([
  "pending",
  "failed",
  "wrong-contract",
  "wrong-sender",
  "wrong-hash",
  "wrong-deposit",
  "extra-action",
  "wrong-recipient",
  "wrong-amount",
  "wrong-memo",
  "receipt-failure",
  "missing-receipt",
  "wrong-network",
])("%s evidence cannot mark an invoice paid", async (scenario) => {
  const invoice = await issuedInvoice();
  const value = await evidence(invoice);
  const tx = value.transaction;
  if (scenario === "pending")
    value.final_execution_status = "EXECUTED_OPTIMISTIC";
  if (scenario === "failed") Object.assign(value, { status: { Failure: {} } });
  if (scenario === "wrong-contract")
    tx.receiver_id =
      "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near";
  if (scenario === "wrong-sender") tx.signer_id = "other.testnet";
  if (scenario === "wrong-hash") tx.hash = "B".repeat(44);
  if (scenario === "wrong-deposit") tx.actions[0].FunctionCall.deposit = "0";
  if (scenario === "extra-action") tx.actions.push(tx.actions[0]);
  if (["wrong-recipient", "wrong-amount", "wrong-memo"].includes(scenario)) {
    const args = {
      receiver_id: "alice.testnet",
      amount: "12500000",
      memo: invoice.payment_reference,
    };
    if (scenario === "wrong-recipient") args.receiver_id = "other.testnet";
    if (scenario === "wrong-amount") args.amount = "12500001";
    if (scenario === "wrong-memo") args.memo = "other-reference";
    tx.actions[0].FunctionCall.args = Buffer.from(
      JSON.stringify(args),
    ).toString("base64");
  }
  if (scenario === "receipt-failure")
    Object.assign(value.receipts_outcome[0].outcome, {
      status: { Failure: {} },
    });
  if (scenario === "missing-receipt") value.receipts_outcome = [];
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify(value),
  });
  if (scenario === "wrong-network")
    await fetch(`${environment().supabaseUrl}/__scenario`, {
      method: "POST",
      body: JSON.stringify({ scenario: "wrong-network" }),
    });
  expect((await verify(invoice.access_token)).status).toBe(
    scenario === "wrong-network" ? 503 : 422,
  );
  expect(
    (await (await request(`/api/portal/${invoice.access_token}`)).json())
      .invoice.status,
  ).not.toBe("paid");
});

test("the applied receipt is available in the portal and as a private-safe PDF", async () => {
  const invoice = await issuedInvoice();
  const path = `/api/portal/${invoice.access_token}/receipt/pdf`;
  expect((await request(path)).status).toBe(409);
  await evidence(invoice);
  expect((await verify(invoice.access_token)).status).toBe(200);
  const pdf = await request(path);
  expect(pdf.status).toBe(200);
  expect(pdf.headers.get("content-type")).toBe("application/pdf");
  const text = Buffer.from(await pdf.arrayBuffer()).toString("latin1");
  expect(text).toContain("%PDF-1.4");
  expect(text).toContain(hash);
  expect(text).toContain("payer.testnet");
  expect(text).not.toContain("Private client");
  expect(
    await (await request(`/portal/${invoice.access_token}`)).text(),
  ).toContain("Verified payment receipt");
  expect(
    (
      await request(`/api/invoices/${invoice.id}/receipt/pdf`, {
        headers: { authorization: `Bearer ${environment().bobToken}` },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await request(`/api/invoices/${invoice.id}/receipt/pdf`, {
        headers: { authorization: `Bearer ${environment().aliceToken}` },
      })
    ).status,
  ).toBe(200);
});

test("concurrent verification is idempotent and additional payments preserve the applied receipt", async () => {
  const invoice = await issuedInvoice();
  await evidence(invoice);
  const responses = await Promise.all(
    Array.from({ length: 4 }, () => verify(invoice.access_token)),
  );
  const first = await responses[0].json();
  for (const response of responses) expect(response.status).toBe(200);
  const secondHash = "B".repeat(44);
  const value = await evidence(invoice);
  value.transaction.hash = secondHash;
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify(value),
  });
  const additional = await (
    await verify(invoice.access_token, secondHash)
  ).json();
  expect(additional.classification).toBe("overpayment");
  expect(additional.receipt).toEqual(first.receipt);
  const headers = {
    apikey: environment().anonKey,
    authorization: `Bearer ${environment().aliceToken}`,
  };
  const rows = await fetch(
    `${environment().supabaseUrl}/rest/v1/verified_payments?select=*`,
    { headers },
  );
  expect(await rows.json()).toHaveLength(2);
  const other = await fetch(
    `${environment().supabaseUrl}/rest/v1/verified_payments?select=*`,
    {
      headers: {
        ...headers,
        authorization: `Bearer ${environment().bobToken}`,
      },
    },
  );
  expect(await other.json()).toEqual([]);
  const forged = await fetch(
    `${environment().supabaseUrl}/rest/v1/rpc/record_verified_payment`,
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        p_invoice: invoice.id,
        p_hash: "C".repeat(44),
        p_sender: "payer.testnet",
        p_block: "forged",
        p_timestamp: "2026-11-14T01:00:00Z",
      }),
    },
  );
  expect(forged.status).toBe(403);
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "offline" }),
  });
  expect(await (await verify(invoice.access_token)).json()).toEqual(first);
});
