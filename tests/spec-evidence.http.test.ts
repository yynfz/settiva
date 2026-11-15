import { test, expect } from "vitest";
import { environment, request } from "./support/context";
import { issuedInvoice, evidence, verify } from "./support/payment-fixture";
test("a payment finalized before invoice creation cannot satisfy it", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const invoice = await issuedInvoice();
  await evidence(invoice);
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "old-block" }),
  });
  expect((await verify(invoice.access_token)).status).toBe(422);
  expect(
    (await (await request(`/api/portal/${invoice.access_token}`)).json())
      .invoice.status,
  ).not.toBe("paid");
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "ready" }),
  });
});

test("concurrent verification cannot bypass the distinct-hash rate limit", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const invoice = await issuedInvoice();
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "offline" }),
  });
  const responses = await Promise.all(
    [..."123456789AB"].map((c) => verify(invoice.access_token, c.repeat(44))),
  );
  expect(
    responses.filter((r) => r.status === 429).length,
  ).toBeGreaterThanOrEqual(1);
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "ready" }),
  });
});
