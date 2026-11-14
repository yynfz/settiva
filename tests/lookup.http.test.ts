import { test, expect, beforeEach } from "vitest";
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
test("lookup returns only the requested transfer and its own receipt", async () => {
  const invoice = await issuedInvoice();
  await evidence(invoice);
  await verify(invoice.access_token);
  const response = await request(
    `/api/portal/${invoice.access_token}/lookup?hash=${hash}`,
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    status: "verified",
    classification: "applied",
    transactionHash: hash,
  });
  expect(JSON.stringify(body)).not.toContain("Private client");
  expect(
    (
      await request(
        `/api/portal/${invoice.access_token}/lookup?hash=${"B".repeat(44)}`,
      )
    ).status,
  ).toBe(404);
});

test("lookup rejects invalid hashes and limits repeated reads", async () => {
  const invoice = await issuedInvoice();
  const path = `/api/portal/${invoice.access_token}/lookup`;
  expect((await request(`${path}?hash=invalid`)).status).toBe(400);
  for (let i = 0; i < 30; i++)
    expect((await request(`${path}?hash=${hash}`)).status).toBe(404);
  expect((await request(`${path}?hash=${hash}`)).status).toBe(429);
});

test("an overpayment lookup and PDF do not expose another transfer", async () => {
  const invoice = await issuedInvoice();
  await evidence(invoice);
  await verify(invoice.access_token);
  const second = "B".repeat(44);
  const value = await evidence(invoice);
  value.transaction.hash = second;
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify(value),
  });
  await verify(invoice.access_token, second);
  const path = `/api/portal/${invoice.access_token}/lookup?hash=${second}`;
  const response = await request(path);
  const body = await response.json();
  expect(body).toMatchObject({
    classification: "overpayment",
    refundStatus: "refund_needed",
    details: { transactionHash: second },
  });
  expect(JSON.stringify(body)).not.toContain(hash);
  const pdf = await request(`${path}&format=pdf`);
  expect(pdf.status).toBe(200);
  const text = await pdf.text();
  expect(text).toContain(second);
  expect(text).not.toContain(hash);
  const other = await issuedInvoice();
  expect(
    (await request(`/api/portal/${other.access_token}/lookup?hash=${second}`))
      .status,
  ).toBe(404);
  expect(
    (
      await request(`/api/payments/anything/refund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionHash: hash }),
      })
    ).status,
  ).toBe(401);
});

test.each(["pending", "failed", "mismatch"])(
  "lookup reports %s attempt without inventing verified evidence",
  async (outcome) => {
    const invoice = await issuedInvoice();
    const value = await evidence(invoice);
    if (outcome === "pending")
      value.final_execution_status = "EXECUTED_OPTIMISTIC";
    if (outcome === "failed")
      Object.assign(value, {
        status: { Failure: { error_message: "contract failed" } },
      });
    if (outcome === "mismatch") value.transaction.receiver_id = "wrong.testnet";
    await fetch(`${environment().supabaseUrl}/__transaction`, {
      method: "POST",
      body: JSON.stringify(value),
    });
    await verify(invoice.access_token);
    const path = `/api/portal/${invoice.access_token}/lookup?hash=${hash}`;
    const result = await request(path);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      status: outcome,
      transactionHash: hash,
      classification: null,
    });
    expect((await request(`${path}&format=pdf`)).status).toBe(409);
  },
);
