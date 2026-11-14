import { test, expect } from "vitest";
import { environment, request } from "./support/context";
import { issuedInvoice, evidence, verify } from "./support/payment-fixture";
test("network policy is server controlled and mainnet issuance stays disabled", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const invoice = await issuedInvoice();
  const response = await request(
    `/api/portal/${invoice.access_token}/checkout`,
    { method: "POST" },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    network: "testnet",
    badge: "TESTNET DEMO",
    checkoutEnabled: true,
  });
});

test("disabled mainnet checkout preserves historical views and final settlement proof", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const base = await issuedInvoice();
  const fixture = await fetch(`${environment().supabaseUrl}/__historical`, {
    method: "POST",
    body: JSON.stringify({ id: base.id }),
  });
  const invoice = await fixture.json();
  const portal = await request(`/api/portal/${invoice.access_token}`);
  expect(portal.status).toBe(200);
  expect((await portal.json()).invoice).toMatchObject({
    network: "mainnet",
    badge:
      process.env.SETTIVA_MAINNET_ENABLED === "true"
        ? "MAINNET LIMITED DEMO"
        : "DISABLED",
    checkoutEnabled: process.env.SETTIVA_MAINNET_ENABLED === "true",
  });
  expect(
    (
      await request(`/api/portal/${invoice.access_token}/checkout`, {
        method: "POST",
        body: JSON.stringify({ checkoutEnabled: true, network: "testnet" }),
      })
    ).status,
  ).toBe(process.env.SETTIVA_MAINNET_ENABLED === "true" ? 200 : 403);
  const ev = await evidence(invoice);
  ev.transaction.actions[0].FunctionCall.args = Buffer.from(
    JSON.stringify({
      receiver_id: "merchant.near",
      amount: invoice.amount_atomic,
      memo: invoice.payment_reference,
    }),
  ).toString("base64");
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify(ev),
  });
  expect((await verify(invoice.access_token)).status).toBe(200);
  const pdf = await request(`/api/portal/${invoice.access_token}/receipt/pdf`);
  expect(pdf.status).toBe(200);
  expect(await pdf.text()).toContain(
    process.env.SETTIVA_MAINNET_ENABLED === "true"
      ? "MAINNET LIMITED DEMO"
      : "DISABLED",
  );
  const expectedBadge =
    process.env.SETTIVA_MAINNET_ENABLED === "true"
      ? "MAINNET LIMITED DEMO"
      : "DISABLED";
  for (const path of [
    `/api/portal/${invoice.access_token}/pdf`,
    `/api/invoices/${invoice.id}/pdf`,
  ]) {
    const document = await request(path, {
      headers: { authorization: `Bearer ${environment().aliceToken}` },
    });
    expect(document.status).toBe(200);
    expect(await document.text()).toContain(expectedBadge);
  }
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "wrong-network" }),
  });
  const otherHash = "B".repeat(44);
  expect((await verify(invoice.access_token, otherHash)).status).toBe(503);
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "ready" }),
  });
  const page = await request(`/portal/${invoice.access_token}`);
  expect(await page.text()).toContain(
    process.env.SETTIVA_MAINNET_ENABLED === "true"
      ? "MAINNET LIMITED DEMO"
      : "DISABLED",
  );
});

test("mainnet fallback assets are rejected and clients cannot issue mainnet invoices", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const base = await issuedInvoice();
  const response = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      network: "mainnet",
      clientLabel: "client",
      items: [{ description: "work", quantity: 1, unitPrice: "1" }],
    }),
  });
  expect(response.status).toBe(403);
  const fixture = await fetch(`${environment().supabaseUrl}/__historical`, {
    method: "POST",
    body: JSON.stringify({
      id: base.id,
      kind: "test-token",
      contract: "fake.near",
    }),
  });
  const invoice = await fixture.json();
  expect(
    (
      await request(`/api/portal/${invoice.access_token}/checkout`, {
        method: "POST",
      })
    ).status,
  ).toBe(422);
  expect((await verify(invoice.access_token)).status).toBe(422);
});
