import { test, expect, beforeEach } from "vitest";
import { environment, request } from "./support/context";
import { issuedInvoice } from "./support/payment-fixture";
beforeEach(async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
});
const headers = () => ({
  authorization: `Bearer ${environment().aliceToken}`,
  "content-type": "application/json",
});
const issue = (items: unknown) =>
  request("/api/invoices", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ clientLabel: "Private", items }),
  });
test("fractional quantities never silently round a requested atomic amount", async () => {
  await issuedInvoice();
  const response = await issue([
    { description: "Fractional", quantity: 1.00001, unitPrice: "1" },
  ]);
  expect(response.status).toBe(422);
  const subatomic = await issue([
    { description: "Fractional", quantity: 1.5, unitPrice: "0.000001" },
  ]);
  expect(subatomic.status).toBe(422);
});

test("concurrent issuance allocates distinct sequential numbers with complete line items", async () => {
  await issuedInvoice();
  const responses = await Promise.all(
    Array.from({ length: 5 }, () =>
      issue([{ description: "Work", quantity: 1, unitPrice: "2" }]),
    ),
  );
  const invoices = [];
  for (const response of responses) {
    expect(response.status).toBe(201);
    invoices.push((await response.json()).invoice);
  }
  expect(new Set(invoices.map((i) => i.invoice_number)).size).toBe(5);
  for (const invoice of invoices) expect(invoice.items).toHaveLength(1);
});

test("issuance rechecks storage and refuses client-supplied settlement state", async () => {
  await issuedInvoice();
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "unregistered" }),
  });
  expect(
    (await issue([{ description: "Work", quantity: 1, unitPrice: "2" }]))
      .status,
  ).toBe(409);
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "ready" }),
  });
  const response = await request("/api/invoices", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      clientLabel: "Private",
      status: "paid",
      items: [{ description: "Work", quantity: 1, unitPrice: "2" }],
    }),
  });
  expect(response.status).toBe(422);
});

test("valid fractional totals retain every atomic unit", async () => {
  await issuedInvoice();
  const response = await issue([
    { description: "Precise", quantity: 1.2345, unitPrice: "2" },
  ]);
  expect(response.status).toBe(201);
  expect((await response.json()).invoice.amount_atomic).toBe("2469000");
});

test("raw JSON decimal quantities are preserved before numeric conversion", async () => {
  await issuedInvoice();
  const response = await request("/api/invoices", {
    method: "POST",
    headers: headers(),
    body: '{"clientLabel":"Exact","items":[{"description":"Large exact quantity","quantity":9007199254740990.0001,"unitPrice":"1"}]}',
  });
  expect(response.status).toBe(201);
  const invoice = (await response.json()).invoice;
  expect(invoice.items[0].quantity).toBe("9007199254740990.0001");
  expect(invoice.amount_atomic).toBe("9007199254740990000100");
  const rejected = await request("/api/invoices", {
    method: "POST",
    headers: headers(),
    body: '{"clientLabel":"Exact","items":[{"description":"Overprecision","quantity":1.00000000000000001,"unitPrice":"1"}]}',
  });
  expect(rejected.status).toBe(422);
});

test.each(["abc", "1.2.3", "-1", "0"])(
  "malformed quantity %s returns validation error",
  async (quantity) => {
    await issuedInvoice();
    expect(
      (await issue([{ description: "Invalid", quantity, unitPrice: "1" }]))
        .status,
    ).toBe(422);
  },
);
